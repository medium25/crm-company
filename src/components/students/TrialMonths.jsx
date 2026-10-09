import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, Timestamp } from 'firebase/firestore';
import { differenceInCalendarDays, format, startOfMonth, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarDays, ChevronDown, GraduationCap } from 'lucide-react';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { hasTrialHappened } from '../../lib/stats.js';
import { formatPhone, formatDate, pluralize } from '../../lib/format.js';
import { Badge } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

export const TRIAL_MONTHS = 6;

const ROW_GRID = 'grid grid-cols-[1.6fr_1.3fr_0.8fr_1fr_0.9fr_1.3fr] items-center gap-3';
const NO_TEACHER = 'Без учителя';
const STATUS_CLASS = {
  paid: 'bg-success-bg text-success',
  left: 'bg-danger/10 text-danger',
  wip: 'bg-warning-bg text-warning',
};

/**
 * Итог пробного: «Оплатил» — дошёл до оплаты, «Ушёл» — отказ или уже ушёл, иначе «Процесс» — решения ещё нет
 * (считаем дни с пробного). Те же признаки, что у «остались» на дашборде (countTrialMonthRetention).
 */
export function trialOutcome(student, now = new Date()) {
  if (student.funnelStage === 'lost' || student.status === 'left') return { key: 'left', label: 'Ушёл' };
  if (student.funnelStage === 'won' || student.status === 'active') return { key: 'paid', label: 'Оплатил' };
  const days = Math.max(0, differenceInCalendarDays(now, student.trialDate.toDate()));
  return { key: 'wip', label: days === 0 ? 'Процесс · сегодня' : `Процесс · ${days} дн.` };
}

function pickEnrollment(list) {
  if (!list?.length) return null;
  const live = list.filter((e) => e.status !== 'left' && e.status !== 'archived');
  const pool = live.length ? live : list;
  return [...pool].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0];
}

/**
 * «На пробном уроке»: пробные за последние 6 месяцев, главное деление — месяцы (пастельные карточки, как у «Покинувших»).
 * Внутри месяца — строки по учителям: имя, телефон, дата пробного, учитель, группа, итог.
 * @param {Object} props
 * @param {string} props.search поиск по имени/телефону
 * @param {Object[]} props.enrollments действующие записи филиала (страница уже их грузит)
 * @param {(drilled: boolean) => void} [props.onDrillChange]
 */
export function TrialMonths({ search, enrollments, onDrillChange }) {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const [open, setOpen] = useState(() => new Set([format(new Date(), 'yyyy-MM')]));

  useEffect(() => {
    onDrillChange?.(false);
  }, [onDrillChange]);

  const windowStart = useMemo(() => startOfMonth(subMonths(new Date(), TRIAL_MONTHS - 1)), []);

  const studentsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('trialDate', '>=', Timestamp.fromDate(windowStart)))
        : null,
    [activeBranchId, windowStart],
  );
  const { data: students, loading, error } = useCollection(studentsQuery);

  // Ушедших из группы в «действующих» записях может не быть — берём и их, чтобы у «Ушёл» тоже были учитель и группа.
  const leftEnrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('status', 'in', ['left', 'archived'])) : null),
    [activeBranchId],
  );
  const { data: leftEnrollments } = useCollection(leftEnrollmentsQuery);

  const enrollmentsByStudent = useMemo(() => {
    const map = new Map();
    const seen = new Set();
    for (const e of [...enrollments, ...leftEnrollments]) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (!map.has(e.studentId)) map.set(e.studentId, []);
      map.get(e.studentId).push(e);
    }
    return map;
  }, [enrollments, leftEnrollments]);

  const months = useMemo(() => {
    const now = new Date();
    const needle = search.trim().toLowerCase();
    const byMonth = new Map();
    for (const s of students) {
      if (!s.trialDate || !hasTrialHappened(s)) continue;
      const date = s.trialDate.toDate();
      if (date > now) continue;
      if (needle && !(s.fullName ?? '').toLowerCase().includes(needle) && !(s.phone ?? '').includes(needle)) continue;
      const enr = pickEnrollment(enrollmentsByStudent.get(s.id));
      const key = format(date, 'yyyy-MM');
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push({ student: s, date, enr, teacher: enr?.teacherName || NO_TEACHER, outcome: trialOutcome(s, now) });
    }
    return Array.from({ length: TRIAL_MONTHS }, (_, i) => {
      const d = subMonths(startOfMonth(now), i);
      const key = format(d, 'yyyy-MM');
      const label = format(d, 'LLLL yyyy', { locale: ru });
      const rows = byMonth.get(key) ?? [];
      const teachers = new Map();
      for (const r of rows) {
        if (!teachers.has(r.teacher)) teachers.set(r.teacher, []);
        teachers.get(r.teacher).push(r);
      }
      const groups = [...teachers.entries()]
        .map(([name, list]) => [name, list.sort((a, b) => a.date - b.date)])
        .sort((a, b) => (a[0] === NO_TEACHER) - (b[0] === NO_TEACHER) || a[0].localeCompare(b[0], 'ru'));
      const count = (k) => rows.filter((r) => r.outcome.key === k).length;
      return { key, label: label.charAt(0).toUpperCase() + label.slice(1), total: rows.length, paid: count('paid'), left: count('left'), wip: count('wip'), groups };
    });
  }, [students, enrollmentsByStudent, search]);

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (error) return <p className="text-control text-danger">Не удалось загрузить. Проверьте соединение.</p>;
  if (loading) {
    return (
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (months.every((m) => m.total === 0)) {
    return <EmptyState icon={GraduationCap} title={search.trim() ? 'Ничего не найдено' : 'Пробных за последние 6 месяцев нет'} />;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {months.map((m, i) => {
        const hue = `rgb(var(--color-chart-${(i % 7) + 1}))`;
        const mix = (pct) => `color-mix(in srgb, ${hue} ${pct}%, rgb(var(--color-surface)))`;
        const isOpen = open.has(m.key) && m.total > 0;
        const paidPct = m.total ? Math.round((m.paid / m.total) * 100) : 0;
        return (
          <section key={m.key} className="rounded-card border-[1.5px] px-4 py-3.5" style={{ backgroundColor: mix(14), borderColor: mix(38) }}>
            <button
              type="button"
              onClick={() => m.total > 0 && toggle(m.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-row text-white" style={{ backgroundColor: hue }}>
                <CalendarDays className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="flex-1">
                <span className="block text-title font-bold" style={{ color: `color-mix(in srgb, ${hue} 60%, rgb(var(--color-text)))` }}>
                  {m.label}
                </span>
                <span className="block text-small text-muted">
                  {m.total} {pluralize(m.total, ['пробный', 'пробных', 'пробных'])}
                  {m.total > 0 && ` · оплатили ${m.paid} · ушли ${m.left} · в процессе ${m.wip}`}
                </span>
              </span>
              {m.total > 0 && (
                <>
                  <span className="hidden h-2 w-32 shrink-0 rounded-badge sm:block" style={{ backgroundColor: mix(22) }} aria-hidden="true">
                    <span className="block h-full rounded-badge" style={{ width: `${paidPct}%`, backgroundColor: hue }} />
                  </span>
                  <span className="w-10 shrink-0 text-right text-small font-bold text-text">{paidPct}%</span>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </>
              )}
            </button>

            {isOpen && (
              <div className="mt-3 overflow-x-auto">
                <div className="min-w-[44rem]">
                  <div className={`${ROW_GRID} px-3 pt-1 text-caption text-muted`}>
                    <span>Имя</span>
                    <span>Телефон</span>
                    <span>Дата</span>
                    <span>Учитель</span>
                    <span>Группа</span>
                    <span>Статус</span>
                  </div>
                  {m.groups.map(([teacher, rows]) => (
                    <div key={teacher} className="mb-2 last:mb-0">
                      <p className="mb-1.5 mt-2 px-1 text-small font-bold" style={{ color: `color-mix(in srgb, ${hue} 60%, rgb(var(--color-text)))` }}>
                        {teacher} · {rows.length}
                      </p>
                      {rows.map((r) => (
                        <button
                          key={r.student.id}
                          type="button"
                          onClick={() => navigate(`/students/${r.student.id}`)}
                          className={`mb-1.5 ${ROW_GRID} w-full rounded-row border border-border bg-card px-3 py-2.5 text-left text-control text-text transition hover:border-border-strong hover:shadow-card`}
                        >
                          <span className="truncate font-bold">{r.student.fullName}</span>
                          <span className="truncate text-muted">{formatPhone(r.student.phone)}</span>
                          <span>{formatDate(r.student.trialDate)}</span>
                          <span className="truncate text-muted">{r.teacher === NO_TEACHER ? '—' : r.teacher}</span>
                          <span>{r.enr?.groupCode ? <Badge variant="group-code">{r.enr.groupCode}</Badge> : '—'}</span>
                          <span>
                            <span className={`inline-block whitespace-nowrap rounded-badge px-2.5 py-0.5 text-caption font-bold ${STATUS_CLASS[r.outcome.key]}`}>
                              {r.outcome.label}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
