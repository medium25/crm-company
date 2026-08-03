import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, query, where, orderBy, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { Plus, CircleUserRound, MessageSquare, Download, ArrowLeft, ChevronRight, Wallet, CalendarCheck, UserX, Snowflake, GraduationCap, FileWarning } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { FilterBar } from '../components/layout/FilterBar.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { SmsSendModal } from '../components/shared/SmsSendModal.jsx';
import { AttendanceByTeacher } from '../components/students/AttendanceByTeacher.jsx';
import { DebtorsByTeacher } from '../components/students/DebtorsByTeacher.jsx';
import { NoChargeHistoryList } from '../components/students/NoChargeHistoryList.jsx';
import { formatPhone, formatMoney, formatDate, formatDuration, formatAvgMonths } from '../lib/format.js';
import { toCsv, downloadCsv } from '../lib/csv.js';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Статус: все' },
  { value: 'active', label: 'Активные' },
  { value: 'trial', label: 'Пробный' },
  { value: 'paused', label: 'Заморожены' },
  { value: 'left', label: 'Ушли' },
  { value: 'archived', label: 'Архив' },
];

const SECTION_TABS = [
  { key: 'all', label: 'Все ученики', description: 'Полный список, статус, баланс, срок обучения', icon: CircleUserRound },
  { key: 'debtors', label: 'Должники', description: 'По чётности дней и учителям', icon: Wallet },
  { key: 'attendance', label: 'Посещаемость', description: 'По учителям — их студенты сразу по всем группам', icon: CalendarCheck },
  { key: 'paused', label: 'Замороженные', description: 'Студенты на паузе', icon: Snowflake },
  { key: 'trial', label: 'На пробном уроке', description: 'Пробные, сгруппированы по учителям', icon: GraduationCap },
  { key: 'left', label: 'Покинувшие', description: 'Кто ушёл и сколько успел проучиться', icon: UserX },
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

  const section = searchParams.get('section') || null;
  const search = searchParams.get('q') || '';
  const status = searchParams.get('status') || 'all';
  const onlyDebtors = searchParams.get('debtors') === '1';
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  // «Покинувшие»/«Замороженные»/«На пробном» — отдельные секции с
  // фиксированным фильтром статуса; общий фильтр «Статус» из «Все ученики»
  // на них не влияет. «Должники» — свой drill-down компонент, здесь не
  // участвует.
  const effectiveStatus =
    section === 'left' ? 'left' :
    section === 'paused' ? 'paused' :
    section === 'trial' ? 'trial' :
    status;
  const effectiveOnlyDebtors = onlyDebtors;

  const setFilter = (patch) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete('page');
    setSearchParams(next);
  };
  const setSection = (key) => {
    const next = new URLSearchParams(searchParams);
    next.set('section', key);
    next.delete('page');
    setSearchParams(next);
  };
  const goToLanding = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('section');
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
    const clauses = [where('branchId', '==', activeBranchId), where('isArchived', '==', effectiveStatus === 'archived')];
    if (effectiveStatus !== 'all' && effectiveStatus !== 'archived') clauses.push(where('status', '==', effectiveStatus));
    return query(collection(db, 'students'), ...clauses, orderBy('fullName'));
  }, [activeBranchId, effectiveStatus]);
  const showTable = section === 'all' || section === 'left' || section === 'paused' || section === 'trial';
  const { data: rawStudents, loading, error } = useCollection(showTable ? studentsQuery : null);

  const enrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: enrollments } = useCollection(enrollmentsQuery);

  const enrollmentsByStudent = useMemo(() => {
    const map = new Map();
    // "Убрать из группы"/"Вывести" ставит status: 'left'/'archived', но не
    // isArchived — запись остаётся в выборке (isArchived==false), поэтому
    // в бейджах групп и колонке «Учителя» нужно ещё раз отсеять её отдельно,
    // иначе студент выглядит числящимся в группе, из которой его убрали.
    for (const e of enrollments) {
      if (e.status === 'left' || e.status === 'archived') continue;
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
    if (effectiveOnlyDebtors) list = list.filter((st) => st.balance < 0);
    return list;
  }, [rawStudents, search, effectiveOnlyDebtors]);

  // «На пробном уроке» — не таблица, а список по учителям (обычно 1-2
  // пробных на учителя, пагинация тут не нужна).
  const trialByTeacher = useMemo(() => {
    if (section !== 'trial') return [];
    const map = new Map();
    for (const st of filtered) {
      const teacherNames = [...new Set((enrollmentsByStudent.get(st.id) ?? []).map((e) => e.teacherName))];
      const key = teacherNames[0] || 'Без учителя';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(st);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [section, filtered, enrollmentsByStudent]);

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
      const groupsToDecrement = new Set();
      for (const id of selected) {
        batch.update(doc(db, 'students', id), {
          isArchived: true,
          archivedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        // Архивация студента должна убирать его из ростеров групп — иначе
        // группа продолжает показывать давно архивного студента.
        for (const e of enrollments) {
          if (e.studentId !== id) continue;
          batch.update(doc(db, 'enrollments', e.id), {
            status: 'archived',
            isArchived: true,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
          if (e.status === 'active' || e.status === 'trial' || e.status === 'paused') {
            groupsToDecrement.add(e.groupId);
          }
        }
      }
      for (const groupId of groupsToDecrement) {
        batch.update(doc(db, 'groups', groupId), { studentsCount: increment(-1) });
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
      width: '48px',
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
      width: 'minmax(220px, 1.5fr)',
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
    ...(section === 'all' || section === 'left' || section === 'paused'
      ? [
          {
            key: 'duration',
            label: 'Обучается',
            render: (st) => formatDuration(st.createdAt, section === 'left' ? st.leftAt : null),
          },
        ]
      : []),
    {
      key: 'balance',
      label: 'Баланс',
      render: (st) => <span className={st.balance > 0 ? 'text-success' : 'text-danger'}>{formatMoney(st.balance)}</span>,
    },
  ];
  const trialColumns = columns.filter((c) => c.key !== 'teachers');

  if (!section) {
    return (
      <>
        <PageHeader title="Студенты" />
        <div className="flex flex-col gap-3">
          {SECTION_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <Card
                key={t.key}
                hoverable
                className="flex cursor-pointer items-center gap-4 p-5"
                onClick={() => setSection(t.key)}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <span className="flex-1">
                  <span className="block text-[17px] font-bold text-text">{t.label}</span>
                  <span className="block text-[13px] text-muted">{t.description}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
              </Card>
            );
          })}
        </div>

        <StudentFormModal student={modalStudent} onClose={() => setModalStudent(null)} onCreated={(id) => navigate(`/students/${id}`)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Студенты"
        count={section === 'attendance' || section === 'debtors' ? undefined : filtered.length}
        actions={
          section === 'attendance' || section === 'debtors' ? null : (
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
          )
        }
      />

      <button type="button" onClick={goToLanding} className="mb-6 flex items-center gap-1 text-[15px] text-link">
        <ArrowLeft className="h-4 w-4" /> Все разделы
      </button>

      {section === 'attendance' ? (
        <AttendanceByTeacher />
      ) : section === 'debtors' ? (
        <DebtorsByTeacher />
      ) : (
        <>
          <FilterBar onReset={resetFilters}>
            <Input placeholder="Поиск по имени или телефону" value={search} onChange={(e) => setFilter({ q: e.target.value })} className="w-64" />
            {section === 'all' && (
              <>
                <Select options={STATUS_OPTIONS} value={status} onChange={(e) => setFilter({ status: e.target.value })} className="w-44" />
                <label className="flex h-11 items-center gap-2 rounded-field border border-border-strong px-3 text-[15px] text-text">
                  <input type="checkbox" checked={onlyDebtors} onChange={(e) => setFilter({ debtors: e.target.checked ? '1' : '' })} />
                  Только должники
                </label>
              </>
            )}
          </FilterBar>

          {section === 'all' && !loading && filtered.length > 0 && (
            <p className="mb-3 text-[13px] text-muted">
              Средний срок обучения: <span className="font-bold text-text">{formatAvgMonths(filtered)}</span>
            </p>
          )}

          {loading && (
            <div className="flex flex-col gap-2">
              <SkeletonRow columns={6} />
              <SkeletonRow columns={6} />
              <SkeletonRow columns={6} />
            </div>
          )}

          {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              icon={section === 'paused' ? Snowflake : section === 'trial' ? GraduationCap : CircleUserRound}
              title={
                section === 'left' ? 'Никто не уходил' :
                section === 'paused' ? 'Замороженных нет' :
                section === 'trial' ? 'Никого нет на пробном' :
                'Пока нет ни одного студента'
              }
              actionLabel={section === 'all' ? 'Добавить' : undefined}
              onAction={section === 'all' ? () => setModalStudent({}) : undefined}
            />
          )}

          {!loading && !error && filtered.length > 0 && section === 'trial' && (
            <div className="flex flex-col gap-6">
              {trialByTeacher.map(([teacherName, students]) => (
                <Card key={teacherName}>
                  <h3 className="mb-4 text-[15px] font-bold text-text">{teacherName}</h3>
                  <Table columns={trialColumns} rows={students} onRowClick={(st) => navigate(`/students/${st.id}`)} />
                </Card>
              ))}
            </div>
          )}

          {!loading && !error && filtered.length > 0 && section !== 'trial' && (
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
