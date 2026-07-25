import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, query, where, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Plus, CircleUserRound, MessageSquare, Download } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { FilterBar } from '../components/layout/FilterBar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { SmsSendModal } from '../components/shared/SmsSendModal.jsx';
import { formatPhone, formatMoney, formatDate } from '../lib/format.js';
import { toCsv, downloadCsv } from '../lib/csv.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Статус: все' },
  { value: 'active', label: 'Активные' },
  { value: 'trial', label: 'Пробный' },
  { value: 'paused', label: 'Заморожены' },
  { value: 'left', label: 'Ушли' },
  { value: 'archived', label: 'Архив' },
];

const PAGE_SIZE = 25;

export function StudentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalStudent, setModalStudent] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [smsOpen, setSmsOpen] = useState(false);

  const search = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'all';
  const onlyDebtors = searchParams.get('debtors') === '1';
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const setFilter = (patch) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setSearchParams(next);
  };
  const setPage = (n) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(n));
    setSearchParams(next);
  };
  const resetFilters = () => setSearchParams(new URLSearchParams());

  const studentsQuery = useMemo(() => {
    if (!db || !activeBranchId) return null;
    const clauses = [where('branchId', '==', activeBranchId), where('isArchived', '==', status === 'archived')];
    if (status !== 'all' && status !== 'archived') clauses.push(where('status', '==', status));
    return query(collection(db, 'students'), ...clauses, orderBy('fullName'));
  }, [activeBranchId, status]);
  const { data: rawStudents, loading, error } = useCollection(studentsQuery);

  const enrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: enrollments } = useCollection(enrollmentsQuery);

  const enrollmentsByStudent = useMemo(() => {
    const map = new Map();
    for (const e of enrollments) {
      if (!map.has(e.studentId)) map.set(e.studentId, []);
      map.get(e.studentId).push(e);
    }
    return map;
  }, [enrollments]);

  const filtered = useMemo(() => {
    let list = rawStudents;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((st) => st.fullName.toLowerCase().includes(s) || st.phone.includes(s));
    }
    if (onlyDebtors) list = list.filter((st) => st.balance < 0);
    return list;
  }, [rawStudents, search, onlyDebtors]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  const toggleSelected = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkArchive = async () => {
    if (selected.size === 0) return;
    try {
      const batch = writeBatch(db);
      for (const id of selected) {
        batch.update(doc(db, 'students', id), {
          isArchived: true,
          archivedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
      }
      await batch.commit();
      showToast(`В архив: ${selected.size}.`);
      setSelected(new Set());
    } catch {
      showToast('Не удалось перенести в архив.', { type: 'error' });
    }
  };

  const selectedStudents = filtered.filter((st) => selected.has(st.id));

  const exportSelected = () => {
    const columns = [
      { key: 'fullName', label: 'Имя', value: (st) => st.fullName },
      { key: 'phone', label: 'Телефон', value: (st) => formatPhone(st.phone) },
      { key: 'groups', label: 'Группы', value: (st) => (enrollmentsByStudent.get(st.id) ?? []).map((e) => e.groupCode).join('; ') },
      { key: 'balance', label: 'Баланс', value: (st) => st.balance },
      { key: 'status', label: 'Статус', value: (st) => st.status },
      { key: 'createdAt', label: 'Дата добавления', value: (st) => formatDate(st.createdAt) },
    ];
    downloadCsv('студенты.csv', toCsv(columns, selectedStudents.length > 0 ? selectedStudents : filtered));
  };

  const columns = [
    {
      key: '__select',
      label: '',
      render: (st) => (
        <input
          type="checkbox"
          checked={selected.has(st.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(st.id)}
        />
      ),
    },
    {
      key: 'fullName',
      label: 'Имя',
      render: (st) => (
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-[13px] font-bold text-muted">
            {st.fullName[0]}
          </span>
          {st.fullName}
        </span>
      ),
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (st) => (
        <a href={`tel:+${st.phone}`} onClick={(e) => e.stopPropagation()} className="text-link">
          {formatPhone(st.phone)}
        </a>
      ),
    },
    {
      key: 'groups',
      label: 'Группы',
      render: (st) => (
        <span className="flex flex-wrap gap-1">
          {(enrollmentsByStudent.get(st.id) ?? []).map((e) => (
            <Badge key={e.id} variant="group-code">
              {e.groupCode}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'teachers',
      label: 'Учителя',
      render: (st) =>
        [...new Set((enrollmentsByStudent.get(st.id) ?? []).map((e) => e.teacherName))].join(', ') || '—',
    },
    {
      key: 'createdAt',
      label: 'Дата добавления',
      render: (st) => formatDate(st.createdAt),
    },
    {
      key: 'balance',
      label: 'Баланс',
      render: (st) => <span className={st.balance < 0 ? 'text-danger' : 'text-success'}>{formatMoney(st.balance)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Студенты"
        count={filtered.length}
        actions={
          <>
            {selected.size > 0 && (
              <>
                <Button variant="secondary" onClick={() => setSmsOpen(true)}>
                  <MessageSquare className="h-4 w-4" /> SMS ({selected.size})
                </Button>
                <Button variant="danger" onClick={bulkArchive}>
                  В архив ({selected.size})
                </Button>
              </>
            )}
            <Button variant="secondary" onClick={exportSelected} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> Экспорт{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
            <Button onClick={() => setModalStudent({})}>
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          </>
        }
      />

      <FilterBar onReset={resetFilters}>
        <Input placeholder="Поиск по имени или телефону" value={search} onChange={(e) => setFilter({ q: e.target.value })} className="w-64" />
        <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setFilter({ status: e.target.value })} className="w-44" />
        <label className="flex h-11 items-center gap-2 rounded-field border border-border-strong px-3 text-[15px] text-text">
          <input type="checkbox" checked={onlyDebtors} onChange={(e) => setFilter({ debtors: e.target.checked ? '1' : '' })} />
          Только должники
        </label>
      </FilterBar>

      {loading && (
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={6} />
          <SkeletonRow columns={6} />
          <SkeletonRow columns={6} />
        </div>
      )}

      {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={CircleUserRound} title="Пока нет ни одного студента" actionLabel="Добавить" onAction={() => setModalStudent({})} />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <Table columns={columns} rows={pageRows} onRowClick={(st) => navigate(`/students/${st.id}`)} />
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`h-9 w-9 rounded-full text-[15px] ${n === pageClamped ? 'bg-navy text-white' : 'text-text hover:bg-surface-alt'}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <StudentFormModal student={modalStudent} onClose={() => setModalStudent(null)} onCreated={(id) => navigate(`/students/${id}`)} />

      <SmsSendModal
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        recipients={selectedStudents.map((st) => ({ studentId: st.id, studentName: st.fullName }))}
        branchId={activeBranchId}
      />
    </>
  );
}
