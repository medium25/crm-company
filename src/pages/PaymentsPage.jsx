import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { ChevronRight, Coins } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Select } from '../components/ui/Select.jsx';
import { DatePicker } from '../components/ui/DatePicker.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';
import { RevenueChart } from '../components/charts/RevenueChart.jsx';
import { formatDate, formatDateTime, formatMoney } from '../lib/format.js';
import { getMonthlyRevenue } from '../lib/stats.js';
import { toCsv, downloadCsv } from '../lib/csv.js';

const METHOD_OPTIONS = [
  { value: '', label: 'Метод: все' },
  { value: 'cash', label: 'Наличные' },
  { value: 'click', label: 'Click' },
  { value: 'payme', label: 'Payme' },
  { value: 'uzum', label: 'Uzum' },
  { value: 'card', label: 'Карта' },
  { value: 'transfer', label: 'Перечисление' },
];

const TYPE_TOGGLE = [
  { value: 'payment', label: 'Оплаты' },
  { value: 'charge', label: 'Списания' },
  { value: 'all', label: 'Всё' },
];

export function PaymentsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const [searchParams, setSearchParams] = useSearchParams();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [revenue, setRevenue] = useState([]);

  const today = new Date();
  const dateFrom = searchParams.get('from') || format(startOfMonth(today), 'yyyy-MM-dd');
  const dateTo = searchParams.get('to') || format(endOfMonth(today), 'yyyy-MM-dd');
  const search = searchParams.get('q') || '';
  const groupId = searchParams.get('group') || '';
  const teacherId = searchParams.get('teacher') || '';
  const method = searchParams.get('method') || '';
  const employee = searchParams.get('employee') || '';
  const createdFrom = searchParams.get('createdFrom') || '';
  const createdTo = searchParams.get('createdTo') || '';
  const typeFilter = searchParams.get('type') || 'all';

  const setFilter = (patch) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next);
  };

  useEffect(() => {
    if (!db || !activeBranchId) return;
    getMonthlyRevenue(db, activeBranchId).then(setRevenue);
  }, [activeBranchId]);

  const transactionsQuery = useMemo(() => {
    if (!db || !activeBranchId) return null;
    const from = Timestamp.fromDate(new Date(`${dateFrom}T00:00:00`));
    const to = Timestamp.fromDate(new Date(`${dateTo}T23:59:59`));
    return query(
      collection(db, 'transactions'),
      where('branchId', '==', activeBranchId),
      where('date', '>=', from),
      where('date', '<=', to),
      orderBy('date', 'desc'),
    );
  }, [activeBranchId, dateFrom, dateTo]);
  const { data: rawTransactions, loading, error } = useCollection(transactionsQuery);

  const groupsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: groups } = useCollection(groupsQuery);

  const teachersQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'teachers'), where('branchIds', 'array-contains', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: teachers } = useCollection(teachersQuery);

  const filtered = useMemo(() => {
    let list = rawTransactions;
    if (typeFilter !== 'all') list = list.filter((t) => t.type === typeFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((t) => t.studentName?.toLowerCase().includes(s) || t.studentId?.includes(s));
    }
    if (groupId) list = list.filter((t) => t.groupId === groupId);
    if (teacherId) list = list.filter((t) => t.teacherId === teacherId);
    if (method) list = list.filter((t) => t.method === method);
    if (employee.trim()) {
      const e = employee.trim().toLowerCase();
      list = list.filter((t) => t.createdByName?.toLowerCase().includes(e));
    }
    if (createdFrom) {
      const from = new Date(`${createdFrom}T00:00:00`);
      list = list.filter((t) => t.createdAt?.toDate() >= from);
    }
    if (createdTo) {
      const to = new Date(`${createdTo}T23:59:59`);
      list = list.filter((t) => t.createdAt?.toDate() <= to);
    }
    return list;
  }, [rawTransactions, typeFilter, search, groupId, teacherId, method, employee, createdFrom, createdTo]);

  const totalPayments = filtered.filter((t) => t.type === 'payment').reduce((sum, t) => sum + t.amount, 0);

  const exportFiltered = () => {
    const columns = [
      { key: 'date', label: 'Дата', value: (t) => formatDate(t.date) },
      { key: 'studentName', label: 'Имя', value: (t) => t.studentName },
      { key: 'amount', label: 'Сумма', value: (t) => t.amount },
      { key: 'method', label: 'Метод оплаты', value: (t) => METHOD_OPTIONS.find((m) => m.value === t.method)?.label ?? '' },
      { key: 'teacherName', label: 'Учитель', value: (t) => t.teacherName ?? '' },
      { key: 'groupCode', label: 'Группа', value: (t) => t.groupCode ?? '' },
      { key: 'comment', label: 'Комментарий', value: (t) => t.comment ?? '' },
      { key: 'createdByName', label: 'Сотрудник', value: (t) => t.createdByName ?? '' },
      { key: 'createdAt', label: 'Дата создания', value: (t) => formatDateTime(t.createdAt) },
    ];
    downloadCsv(`платежи-${dateFrom}-${dateTo}.csv`, toCsv(columns, filtered));
  };

  const byMethod = useMemo(() => {
    const map = new Map();
    for (const t of filtered.filter((t) => t.type === 'payment')) {
      map.set(t.method, (map.get(t.method) ?? 0) + t.amount);
    }
    return [...map.entries()];
  }, [filtered]);

  const byTeacher = useMemo(() => {
    const map = new Map();
    for (const t of filtered.filter((t) => t.type === 'payment' && t.teacherName)) {
      map.set(t.teacherName, (map.get(t.teacherName) ?? 0) + t.amount);
    }
    return [...map.entries()];
  }, [filtered]);

  const columns = [
    { key: '__index', label: '№', render: (_t, i) => i + 1 },
    { key: 'date', label: 'Дата', render: (t) => formatDate(t.date) },
    {
      key: 'studentName',
      label: 'Имя',
      render: (t) => (
        <button type="button" onClick={() => navigate(`/students/${t.studentId}`)} className="text-link">
          {t.studentName}
        </button>
      ),
    },
    { key: 'amount', label: 'Сумма', render: (t) => formatMoney(t.amount) },
    { key: 'method', label: 'Метод оплаты', render: (t) => METHOD_OPTIONS.find((m) => m.value === t.method)?.label ?? '—' },
    { key: 'teacherName', label: 'Учитель', render: (t) => t.teacherName ?? '—' },
    {
      key: 'comment',
      label: 'Комментарий',
      render: (t) => (
        <span className="flex items-center gap-1">
          {t.groupCode && <Badge variant="group-code">{t.groupCode}</Badge>}
          {t.comment}
        </span>
      ),
    },
    {
      key: 'createdByName',
      label: 'Сотрудник',
      render: (t) => (
        <span>
          {t.createdByName}
          <br />
          <span className="text-muted">{formatDateTime(t.createdAt)}</span>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Все платежи" />

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="border-l-4 border-l-navy">
            <p className="text-[13px] text-muted">Всего платежей</p>
            <p className="text-[28px] font-bold text-navy-num">{formatMoney(totalPayments)}</p>
            <p className="text-[13px] text-muted">
              {formatDate(Timestamp.fromDate(new Date(dateFrom)))} — {formatDate(Timestamp.fromDate(new Date(dateTo)))}
            </p>
          </Card>
          <Card className="border-l-4 border-l-navy">
            <p className="text-[13px] text-muted">Чистая прибыль</p>
            <p className="text-[28px] font-bold text-navy-num">{formatMoney(totalPayments)}</p>
            <button type="button" onClick={() => setDetailsOpen((v) => !v)} className="mt-1 flex items-center gap-1 text-[13px] text-link">
              Details <ChevronRight className={`h-3.5 w-3.5 transition-transform ${detailsOpen ? 'rotate-90' : ''}`} />
            </button>
            {detailsOpen && (
              <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3 text-[13px]">
                <div>
                  <p className="mb-1 font-bold text-text">По методам оплаты</p>
                  {byMethod.map(([m, sum]) => (
                    <div key={m} className="flex justify-between text-muted">
                      <span>{METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m ?? '—'}</span>
                      <span>{formatMoney(sum)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="mb-1 font-bold text-text">По учителям</p>
                  {byTeacher.map(([t, sum]) => (
                    <div key={t} className="flex justify-between text-muted">
                      <span>{t}</span>
                      <span>{formatMoney(sum)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
        <Card>
          <RevenueChart data={revenue} />
        </Card>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <DatePicker label="Дата от" value={dateFrom} onChange={(e) => setFilter({ from: e.target.value })} />
        <DatePicker label="Дата до" value={dateTo} onChange={(e) => setFilter({ to: e.target.value })} />
        <Input label="Имя или телефон" value={search} onChange={(e) => setFilter({ q: e.target.value })} />
        <Select
          label="Группа"
          options={[{ value: '', label: 'Все' }, ...groups.map((g) => ({ value: g.id, label: g.code }))]}
          value={groupId}
          onChange={(e) => setFilter({ group: e.target.value })}
        />
        <Select
          label="Учитель"
          options={[{ value: '', label: 'Все' }, ...teachers.map((t) => ({ value: t.id, label: t.displayName }))]}
          value={teacherId}
          onChange={(e) => setFilter({ teacher: e.target.value })}
        />
        <Select label="Метод оплаты" options={METHOD_OPTIONS} value={method} onChange={(e) => setFilter({ method: e.target.value })} />
        <Input label="Имя сотрудника" value={employee} onChange={(e) => setFilter({ employee: e.target.value })} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <DatePicker label="От даты создания" value={createdFrom} onChange={(e) => setFilter({ createdFrom: e.target.value })} />
        <DatePicker label="До даты создания" value={createdTo} onChange={(e) => setFilter({ createdTo: e.target.value })} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {TYPE_TOGGLE.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setFilter({ type: t.value })}
              className={`rounded-full px-3 py-1.5 text-[13px] ${typeFilter === t.value ? 'bg-navy text-white' : 'bg-surface-alt text-muted'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button variant="secondary" onClick={exportFiltered} disabled={filtered.length === 0}>
          Экспорт в CSV
        </Button>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={7} />
          <SkeletonRow columns={7} />
        </div>
      )}

      {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

      {!loading && !error && filtered.length === 0 && <EmptyState icon={Coins} title="Платежей за период не найдено" />}

      {!loading && !error && filtered.length > 0 && (
        <>
          <Table columns={columns} rows={filtered} />
          <p className="mt-4 text-right text-[15px] font-bold text-text">
            Итог по фильтру: {formatMoney(filtered.reduce((sum, t) => sum + t.amount, 0))}
          </p>
        </>
      )}
    </>
  );
}
