import { useEffect, useMemo, useState } from 'react';
import { format, startOfYear } from 'date-fns';
import { Download, BarChart3 } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DatePicker } from '../components/ui/DatePicker.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Table } from '../components/ui/Table.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { RevenueChart } from '../components/charts/RevenueChart.jsx';
import { formatMoney } from '../lib/format.js';
import { getMonthlyRevenue } from '../lib/stats.js';
import { revenueByCourse, revenueByTeacher, attendanceByGroup, churnReport, conversionFunnel, debtAging } from '../lib/reports.js';
import { toCsv, downloadCsv } from '../lib/csv.js';

const TABS = [
  { key: 'revenue', label: 'Выручка по месяцам' },
  { key: 'courses', label: 'По курсам' },
  { key: 'teachers', label: 'По учителям' },
  { key: 'attendance', label: 'Посещаемость по группам' },
  { key: 'churn', label: 'Отток и причины ухода' },
  { key: 'conversion', label: 'Конверсия' },
  { key: 'debts', label: 'Долги по срокам' },
];

function fmtDate(d) {
  return format(d, 'dd.MM.yyyy');
}

export function ReportsPage() {
  const { activeBranchId } = useBranch();
  const [tab, setTab] = useState('revenue');

  const today = new Date();
  const [from, setFrom] = useState(format(startOfYear(today), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(today, 'yyyy-MM-dd'));
  const [month, setMonth] = useState(format(today, 'yyyy-MM'));

  const [loading, setLoading] = useState(false);
  const [revenue, setRevenue] = useState([]);
  const [byCourse, setByCourse] = useState([]);
  const [byTeacher, setByTeacher] = useState([]);
  const [byGroup, setByGroup] = useState([]);
  const [churn, setChurn] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [debts, setDebts] = useState([]);

  const fromDate = useMemo(() => new Date(`${from}T00:00:00`), [from]);
  const toDate = useMemo(() => new Date(`${to}T23:59:59`), [to]);

  useEffect(() => {
    if (!db || !activeBranchId) return;
    let cancelled = false;
    setLoading(true);
    const run = async () => {
      if (tab === 'revenue') {
        const data = await getMonthlyRevenue(db, activeBranchId);
        if (!cancelled) setRevenue(data);
      } else if (tab === 'courses') {
        const data = await revenueByCourse(db, activeBranchId, fromDate, toDate);
        if (!cancelled) setByCourse(data);
      } else if (tab === 'teachers') {
        const data = await revenueByTeacher(db, activeBranchId, fromDate, toDate);
        if (!cancelled) setByTeacher(data);
      } else if (tab === 'attendance') {
        const data = await attendanceByGroup(db, activeBranchId, month);
        if (!cancelled) setByGroup(data);
      } else if (tab === 'churn') {
        const data = await churnReport(db, activeBranchId, fromDate, toDate);
        if (!cancelled) setChurn(data);
      } else if (tab === 'conversion') {
        const data = await conversionFunnel(db, activeBranchId, fromDate, toDate);
        if (!cancelled) setFunnel(data);
      } else if (tab === 'debts') {
        const data = await debtAging(db, activeBranchId);
        if (!cancelled) setDebts(data);
      }
      if (!cancelled) setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [tab, activeBranchId, fromDate, toDate, month]);

  const exportCourses = () =>
    downloadCsv(
      'отчёт-по-курсам.csv',
      toCsv(
        [
          { key: 'courseName', label: 'Курс', value: (r) => r.courseName },
          { key: 'amount', label: 'Сумма', value: (r) => r.amount },
        ],
        byCourse,
      ),
    );

  const exportTeachers = () =>
    downloadCsv(
      'отчёт-по-учителям.csv',
      toCsv(
        [
          { key: 'teacherName', label: 'Учитель', value: (r) => r.teacherName },
          { key: 'amount', label: 'Сумма', value: (r) => r.amount },
        ],
        byTeacher,
      ),
    );

  const exportAttendance = () =>
    downloadCsv(
      `посещаемость-${month}.csv`,
      toCsv(
        [
          { key: 'groupCode', label: 'Группа', value: (r) => r.groupCode },
          { key: 'total', label: 'Отмечено занятий', value: (r) => r.total },
          { key: 'present', label: 'Присутствий', value: (r) => r.present },
          { key: 'rate', label: 'Процент', value: (r) => (r.rate == null ? '' : `${r.rate}%`) },
        ],
        byGroup,
      ),
    );

  const exportChurn = () =>
    churn &&
    downloadCsv(
      'отток.csv',
      toCsv(
        [
          { key: 'studentName', label: 'Студент', value: (r) => r.studentName },
          { key: 'groupCode', label: 'Группа', value: (r) => r.groupCode ?? '' },
          { key: 'leftAt', label: 'Дата ухода', value: (r) => fmtDate(r.leftAt) },
          { key: 'reason', label: 'Причина', value: (r) => r.reason },
        ],
        [...churn.leftActiveGroup, ...churn.leftAfterTrial],
      ),
    );

  const exportDebts = () =>
    downloadCsv(
      'долги-по-срокам.csv',
      toCsv(
        [
          { key: 'bucket', label: 'Срок', value: (r) => r.bucket },
          { key: 'studentName', label: 'Студент', value: (r) => r.studentName },
          { key: 'days', label: 'Дней без оплаты', value: (r) => (Number.isFinite(r.days) ? r.days : '') },
          { key: 'balance', label: 'Баланс', value: (r) => r.balance },
        ],
        debts.flatMap((b) => b.students.map((s) => ({ bucket: b.label, ...s }))),
      ),
    );

  return (
    <>
      <PageHeader title="Отчёты" />
      <Card>
        <Tabs tabs={TABS} activeKey={tab} onChange={setTab} />

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {tab !== 'attendance' && (
            <>
              <DatePicker label="От" value={from} onChange={(e) => setFrom(e.target.value)} />
              <DatePicker label="До" value={to} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          {tab === 'attendance' && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-11 rounded-field border border-border-strong px-3 text-[15px] text-text focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
            />
          )}
        </div>

        <div className="mt-6">
          {loading && <Skeleton className="h-64 w-full" />}

          {!loading && tab === 'revenue' && (
            revenue.length === 0 ? (
              <EmptyState icon={BarChart3} title="Пока нет данных по выручке" />
            ) : (
              <RevenueChart data={revenue} />
            )
          )}

          {!loading && tab === 'courses' && (
            <>
              <div className="mb-3 flex justify-end">
                <Button variant="secondary" onClick={exportCourses} disabled={byCourse.length === 0}>
                  <Download className="h-4 w-4" /> Экспорт в CSV
                </Button>
              </div>
              {byCourse.length === 0 ? (
                <EmptyState icon={BarChart3} title="Нет платежей за период" />
              ) : (
                <Table
                  columns={[
                    { key: 'courseName', label: 'Курс' },
                    { key: 'amount', label: 'Сумма', render: (r) => formatMoney(r.amount) },
                  ]}
                  rows={byCourse.map((r, i) => ({ id: i, ...r }))}
                />
              )}
            </>
          )}

          {!loading && tab === 'teachers' && (
            <>
              <div className="mb-3 flex justify-end">
                <Button variant="secondary" onClick={exportTeachers} disabled={byTeacher.length === 0}>
                  <Download className="h-4 w-4" /> Экспорт в CSV
                </Button>
              </div>
              {byTeacher.length === 0 ? (
                <EmptyState icon={BarChart3} title="Нет платежей за период" />
              ) : (
                <Table
                  columns={[
                    { key: 'teacherName', label: 'Учитель' },
                    { key: 'amount', label: 'Сумма', render: (r) => formatMoney(r.amount) },
                  ]}
                  rows={byTeacher.map((r, i) => ({ id: i, ...r }))}
                />
              )}
            </>
          )}

          {!loading && tab === 'attendance' && (
            <>
              <div className="mb-3 flex justify-end">
                <Button variant="secondary" onClick={exportAttendance} disabled={byGroup.length === 0}>
                  <Download className="h-4 w-4" /> Экспорт в CSV
                </Button>
              </div>
              {byGroup.length === 0 ? (
                <EmptyState icon={BarChart3} title="Нет групп" />
              ) : (
                <Table
                  columns={[
                    { key: 'groupCode', label: 'Группа' },
                    { key: 'total', label: 'Отмечено занятий' },
                    { key: 'present', label: 'Присутствий' },
                    { key: 'rate', label: 'Процент', render: (r) => (r.rate == null ? '—' : `${r.rate}%`) },
                  ]}
                  rows={byGroup.map((r) => ({ id: r.groupId, ...r }))}
                />
              )}
            </>
          )}

          {!loading && tab === 'churn' && churn && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[15px] text-text">
                  Ушли из активной группы: <b>{churn.leftActiveGroup.length}</b> · Ушли после пробного: <b>{churn.leftAfterTrial.length}</b>
                </p>
                <Button variant="secondary" onClick={exportChurn} disabled={churn.leftActiveGroup.length + churn.leftAfterTrial.length === 0}>
                  <Download className="h-4 w-4" /> Экспорт в CSV
                </Button>
              </div>
              {churn.byReason.length === 0 ? (
                <EmptyState icon={BarChart3} title="За период оттока нет" />
              ) : (
                <Table
                  columns={[
                    { key: 'reason', label: 'Причина' },
                    { key: 'count', label: 'Количество' },
                  ]}
                  rows={churn.byReason.map((r, i) => ({ id: i, ...r }))}
                />
              )}
            </>
          )}

          {!loading && tab === 'conversion' && funnel && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card className="text-center">
                <p className="text-[13px] text-muted">Лидов заведено</p>
                <p className="text-[34px] text-navy-num">{funnel.totalLeads}</p>
              </Card>
              <Card className="text-center">
                <p className="text-[13px] text-muted">Дошли до пробного</p>
                <p className="text-[34px] text-navy-num">{funnel.reachedTrial}</p>
              </Card>
              <Card className="text-center">
                <p className="text-[13px] text-muted">Стали студентами</p>
                <p className="text-[34px] text-navy-num">{funnel.reachedStudent}</p>
              </Card>
            </div>
          )}

          {!loading && tab === 'debts' && (
            <>
              <div className="mb-3 flex justify-end">
                <Button variant="secondary" onClick={exportDebts} disabled={debts.every((b) => b.students.length === 0)}>
                  <Download className="h-4 w-4" /> Экспорт в CSV
                </Button>
              </div>
              <div className="flex flex-col gap-4">
                {debts.map((b) => (
                  <div key={b.label}>
                    <p className="mb-2 font-bold text-text">
                      {b.label} · {b.students.length} студентов · {formatMoney(b.total)}
                    </p>
                    {b.students.length > 0 && (
                      <Table
                        columns={[
                          { key: 'studentName', label: 'Студент' },
                          { key: 'days', label: 'Дней без оплаты', render: (s) => (Number.isFinite(s.days) ? s.days : '—') },
                          { key: 'balance', label: 'Баланс', render: (s) => formatMoney(s.balance) },
                        ]}
                        rows={b.students.map((s, i) => ({ id: i, ...s }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>
    </>
  );
}
