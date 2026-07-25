import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Plus, Layers } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { FilterBar } from '../components/layout/FilterBar.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Select.jsx';
import { DatePicker } from '../components/ui/DatePicker.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { ColumnsPopover } from '../components/ui/ColumnsPopover.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';
import { GroupFormModal } from '../components/groups/GroupFormModal.jsx';
import { formatDate, formatScheduleType, pluralize } from '../lib/format.js';
import { trainingWeeks } from '../lib/schedule.js';

const STATUS_OPTIONS = [
  { value: 'active', label: 'Действующие' },
  { value: 'all', label: 'Все' },
  { value: 'planned', label: 'Планируемые' },
  { value: 'finished', label: 'Завершённые' },
  { value: 'archived', label: 'Архив' },
];

const DAYS_OPTIONS = [
  { value: '', label: 'Дни: все' },
  { value: 'even', label: 'Чётные дни' },
  { value: 'odd', label: 'Нечётные дни' },
  { value: 'weekdays', label: 'По дням недели' },
];

const ALL_COLUMNS = [
  { key: 'code', label: 'Группа', sortable: true },
  { key: 'courseName', label: 'Курсы', sortable: true },
  { key: 'teacherName', label: 'Учитель', sortable: true },
  { key: 'days', label: 'Дни', sortable: false },
  { key: 'dates', label: 'Даты обучения', sortable: true },
  { key: 'week', label: 'Неделя обучения', sortable: true },
  { key: 'roomName', label: 'Кабинет', sortable: true },
  { key: 'tags', label: 'Tags', sortable: false },
  { key: 'studentsCount', label: 'Студентов', sortable: true },
];

const COLUMNS_STORAGE_KEY = 'icon-crm:groups-columns';
const PAGE_SIZE = 25;

function loadVisibleColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {
    // игнорируем битый localStorage
  }
  return ALL_COLUMNS.map((c) => c.key);
}

export function GroupsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const [searchParams, setSearchParams] = useSearchParams();
  const [visibleColumns, setVisibleColumns] = useState(loadVisibleColumns);
  const [modalGroup, setModalGroup] = useState(null);

  const status = searchParams.get('status') || 'active';
  const teacherId = searchParams.get('teacher') || '';
  const courseId = searchParams.get('course') || '';
  const days = searchParams.get('days') || '';
  const tags = searchParams.get('tags') || '';
  const startFrom = searchParams.get('startFrom') || '';
  const endTo = searchParams.get('endTo') || '';
  const sortKey = searchParams.get('sort') || 'code';
  const sortDir = searchParams.get('dir') || 'asc';
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

  const onSort = (key) => {
    setFilter({ sort: key, dir: key === sortKey && sortDir === 'asc' ? 'desc' : 'asc' });
  };

  const teachersQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'teachers'), where('branchIds', 'array-contains', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId],
  );
  const { data: teachers } = useCollection(teachersQuery);

  const coursesQuery = useMemo(
    () => (db ? query(collection(db, 'courses'), where('isArchived', '==', false)) : null),
    [],
  );
  const { data: courses } = useCollection(coursesQuery);

  const groupsQuery = useMemo(() => {
    if (!db || !activeBranchId) return null;
    const clauses = [where('branchId', '==', activeBranchId), where('isArchived', '==', status === 'archived')];
    if (teacherId) {
      clauses.push(where('teacherId', '==', teacherId));
    } else if (courseId) {
      clauses.push(where('courseId', '==', courseId));
    } else if (['active', 'planned', 'finished'].includes(status)) {
      clauses.push(where('status', '==', status));
    }
    return query(collection(db, 'groups'), ...clauses, orderBy('code'));
  }, [activeBranchId, status, teacherId, courseId]);

  const { data: rawGroups, loading, error } = useCollection(groupsQuery);

  const filtered = useMemo(() => {
    let list = rawGroups;

    // Вторичные фильтры — применяем клиентски поверх узкого серверного запроса
    // (composite-индексы покрывают только одну первичную комбинацию за раз, см. firestore.indexes.json).
    if ((teacherId || courseId) && ['active', 'planned', 'finished'].includes(status)) {
      list = list.filter((g) => g.status === status);
    }
    if (days) list = list.filter((g) => g.schedule?.type === days);
    if (tags.trim()) {
      const wanted = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      list = list.filter((g) => wanted.some((t) => (g.tags ?? []).some((gt) => gt.toLowerCase().includes(t))));
    }
    if (startFrom) {
      const from = new Date(startFrom);
      list = list.filter((g) => g.startDate?.toDate() >= from);
    }
    if (endTo) {
      const to = new Date(endTo);
      list = list.filter((g) => g.endDate?.toDate() <= to);
    }

    const sorted = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'week' || sortKey === 'dates') {
        return (a.startDate?.toMillis() - b.startDate?.toMillis()) * dir;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
    });

    return sorted;
  }, [rawGroups, teacherId, courseId, status, days, tags, startFrom, endTo, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  const handleColumnsChange = (next) => {
    setVisibleColumns(next);
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(next));
  };

  const renderers = {
    code: (g) => <Badge variant="group-code">{g.code}</Badge>,
    courseName: (g) => g.courseName,
    teacherName: (g) => g.teacherName,
    days: (g) => (
      <span>
        {formatScheduleType(g.schedule?.type)}
        <br />
        <span className="text-muted">{g.schedule?.time}</span>
      </span>
    ),
    dates: (g) => (
      <span>
        {formatDate(g.startDate)} —<br />
        {formatDate(g.endDate)}
      </span>
    ),
    week: (g) => {
      if (!g.startDate) return '—';
      const { months, weeks } = trainingWeeks(g.startDate.toDate());
      return (
        <span>
          {months} {pluralize(months, ['месяц', 'месяца', 'месяцев'])}
          <br />
          {weeks} {pluralize(weeks, ['неделя', 'недели', 'недель'])}
        </span>
      );
    },
    roomName: (g) => g.roomName,
    tags: (g) => (
      <span className="flex flex-wrap gap-1">
        {(g.tags ?? []).map((t) => (
          <Badge key={t} variant="group-code">
            {t}
          </Badge>
        ))}
      </span>
    ),
    studentsCount: (g) => g.studentsCount ?? 0,
  };

  const columns = [
    { key: '__index', label: '№', render: (_g, i) => (pageClamped - 1) * PAGE_SIZE + i + 1 },
    ...ALL_COLUMNS.filter((c) => visibleColumns.includes(c.key)).map((c) => ({ ...c, render: renderers[c.key] })),
  ];

  return (
    <>
      <PageHeader
        title="Группы"
        count={filtered.length}
        actions={
          <Button onClick={() => setModalGroup({})}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        }
      />

      <FilterBar onReset={resetFilters}>
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => setFilter({ status: e.target.value })}
          className="w-48"
        />
        <Select
          options={[{ value: '', label: 'Учителя: все' }, ...teachers.map((t) => ({ value: t.id, label: t.displayName }))]}
          value={teacherId}
          onChange={(e) => setFilter({ teacher: e.target.value })}
          className="w-44"
        />
        <Select
          options={[{ value: '', label: 'По курсам: все' }, ...courses.map((c) => ({ value: c.id, label: c.name }))]}
          value={courseId}
          onChange={(e) => setFilter({ course: e.target.value })}
          className="w-44"
        />
        <Select options={DAYS_OPTIONS} value={days} onChange={(e) => setFilter({ days: e.target.value })} className="w-40" />
        <Input placeholder="Тэги" value={tags} onChange={(e) => setFilter({ tags: e.target.value })} className="w-32" />
        <DatePicker
          value={startFrom}
          onChange={(e) => setFilter({ startFrom: e.target.value })}
          aria-label="Дата начала"
        />
        <DatePicker value={endTo} onChange={(e) => setFilter({ endTo: e.target.value })} aria-label="Дата окончания" />
      </FilterBar>

      <div className="mb-4 flex justify-end">
        <ColumnsPopover columns={ALL_COLUMNS} visible={visibleColumns} onChange={handleColumnsChange} />
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={6} />
          <SkeletonRow columns={6} />
          <SkeletonRow columns={6} />
        </div>
      )}

      {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState icon={Layers} title="Пока нет ни одной группы" actionLabel="Добавить группу" onAction={() => setModalGroup({})} />
      )}

      {!loading && !error && filtered.length > 0 && (
        <>
          <Table
            columns={columns}
            rows={pageRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={onSort}
            onRowClick={(g) => navigate(`/groups/${g.id}`)}
          />
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`h-9 w-9 rounded-full text-[15px] ${
                    n === pageClamped ? 'bg-navy text-white' : 'text-text hover:bg-surface-alt'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <GroupFormModal group={modalGroup} onClose={() => setModalGroup(null)} />
    </>
  );
}
