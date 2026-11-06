import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, serverTimestamp, updateDoc, where, Timestamp } from 'firebase/firestore';
import { addMonths, differenceInCalendarDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CalendarDays, ChevronDown, GraduationCap } from 'lucide-react';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { isTrialLeft } from '../../lib/stats.js';
import { formatPhone, formatDate, pluralize } from '../../lib/format.js';
import { Badge } from '../ui/Badge.jsx';
import { useToast } from '../ui/Toast.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

export const TRIAL_MONTHS = 6;

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const ROW_GRID = 'grid grid-cols-[1.6fr_1.3fr_0.8fr_1fr_0.9fr_1.3fr] items-center gap-3';
// «Плоский» вид («Пробные»): без деления по учителям, дата первой колонкой.
const ROW_GRID_FLAT = 'grid grid-cols-[0.8fr_1.6fr_1.3fr_1fr_0.9fr_1.3fr] items-center gap-3';
const STATUS_CLASS = {
  paid: 'bg-success-bg text-success',
  left: 'bg-danger/10 text-danger',
  wip: 'bg-warning-bg text-warning',
};

/**
 * Итог пробного: «Оплатил» — дошёл до оплаты, «Ушёл» (isTrialLeft — те же признаки, что у «остались» на дашборде),
 * иначе «Процесс» — решения ещё нет (считаем дни с пробного).
 */
export function trialOutcome(student, now = new Date()) {
  if (student.status === 'left') return { key: 'left', label: 'Ушёл' };
  if (student.funnelStage === 'won' || student.status === 'active') return { key: 'paid', label: 'Оплатил' };
  if (isTrialLeft(student)) return { key: 'left', label: 'Ушёл' };
  const days = Math.max(0, differenceInCalendarDays(now, student.trialDate.toDate()));
  return { key: 'wip', label: days === 0 ? 'Процесс · сегодня' : `Процесс · ${days} дн.` };
}

/** Комментарий к пробному (students.trialComment): правится прямо в таблице, сохраняется при уходе из поля. */
function TrialCommentCell({ student }) {
  const { showToast } = useToast();
  const saved = student.trialComment ?? '';
  const [value, setValue] = useState(saved);

  useEffect(() => {
    setValue(saved);
  }, [saved]);

  const save = async () => {
    const next = value.trim();
    if (next === saved) return;
    try {
      await updateDoc(doc(db, 'students', student.id), { trialComment: next, updatedAt: serverTimestamp() });
    } catch {
      setValue(saved);
      showToast('Не удалось сохранить комментарий.', { type: 'error' });
    }
  };

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      onClick={(e) => e.stopPropagation()}
      placeholder="Добавить комментарий"
      className="h-8 w-full min-w-40 rounded-field border border-transparent bg-transparent px-2 text-control text-text placeholder:text-muted hover:border-border focus:border-navy focus:bg-white focus:outline-none"
    />
  );
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
 * @param {number} [props.monthOffset] сдвиг показываемого месяца от текущего (0 — текущий, -1 — прошлый); «Пробные» листают им
 * @param {number} [props.monthsCount] сколько последних месяцев показывать (по умолчанию 6; «Пробные» — только текущий)
 * @param {boolean} [props.hideConversion] без полоски и процента оплативших в шапке месяца; «Пробные» — так
 * @param {boolean} [props.hideHeader] без шапки месяца (заголовок рисует страница); «Пробные» — так
 * @param {boolean} [props.lightTable] лёгкая таблица (тонкие линии, статус точкой) вместо строк-карточек; всегда без деления по учителям; «Пробные» — так
 * @param {import('react').ComponentType} [props.headerIcon] иконка в шапке месяца (по умолчанию календарь)
 * @param {boolean} [props.flat] один список по дате вместо деления по учителям, дата — первая колонка; «Пробные» — так
 * @param {boolean} [props.plain] без цветной подложки месяца (только рамка), «Пробные» — так
 * @param {boolean} [props.compactHeader] в шапке месяца только название и конверсия, без строки «оплатили / ушли / в процессе»
 * @param {(drilled: boolean) => void} [props.onDrillChange]
 */
export function TrialMonths({ search, enrollments, onDrillChange, monthsCount = TRIAL_MONTHS, monthOffset = 0, compactHeader = false, plain = false, flat = false, hideConversion = false, lightTable = false, hideHeader = false, headerIcon: HeaderIcon = CalendarDays }) {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const [open, setOpen] = useState(() => new Set([format(new Date(), 'yyyy-MM')]));

  useEffect(() => {
    onDrillChange?.(false);
  }, [onDrillChange]);

  const baseMonth = useMemo(() => addMonths(startOfMonth(new Date()), monthOffset), [monthOffset]);
  const windowStart = useMemo(() => startOfMonth(subMonths(baseMonth, monthsCount - 1)), [baseMonth, monthsCount]);

  const studentsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('trialDate', '>=', Timestamp.fromDate(windowStart)), where('trialDate', '<=', Timestamp.fromDate(endOfMonth(baseMonth))))
        : null,
    [activeBranchId, windowStart, baseMonth],
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
      if (!s.trialDate) continue;
      const date = s.trialDate.toDate();
      if (needle && !(s.fullName ?? '').toLowerCase().includes(needle) && !(s.phone ?? '').includes(needle)) continue;
      // Правило: пробный — кого создали пробным и прикрепили учителя и группу (см. isTrialLeft в stats.js).
      const enr = pickEnrollment(enrollmentsByStudent.get(s.id));
      if (!enr?.teacherName) continue;
      const key = format(date, 'yyyy-MM');
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push({ student: s, date, enr, teacher: enr.teacherName, outcome: trialOutcome(s, now) });
    }
    return Array.from({ length: monthsCount }, (_, i) => {
      const d = subMonths(baseMonth, i);
      const key = format(d, 'yyyy-MM');
      const label = format(d, 'LLLL yyyy', { locale: ru });
      const rows = byMonth.get(key) ?? [];
      const teachers = new Map();
      for (const r of rows) {
        if (!teachers.has(r.teacher)) teachers.set(r.teacher, []);
        teachers.get(r.teacher).push(r);
      }
      const groups = flat || lightTable
        ? [['', [...teachers.values()].flat().sort((a, b) => a.date - b.date)]]
        : [...teachers.entries()]
            .map(([name, list]) => [name, list.sort((a, b) => a.date - b.date)])
            .sort((a, b) => a[0].localeCompare(b[0], 'ru'));
      const count = (k) => rows.filter((r) => r.outcome.key === k).length;
      return { key, label: label.charAt(0).toUpperCase() + label.slice(1), total: rows.length, paid: count('paid'), left: count('left'), wip: count('wip'), groups };
    });
  }, [students, enrollmentsByStudent, search, monthsCount, flat, lightTable, baseMonth]);

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
    return <EmptyState icon={GraduationCap} title={search.trim() ? 'Ничего не найдено' : monthsCount === 1 ? 'Пробных в этом месяце нет' : `Пробных за последние ${monthsCount} месяцев нет`} />;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {months.map((m, i) => {
        const hue = `rgb(var(--color-chart-${(i % 7) + 1}))`;
        const mix = (pct) => `color-mix(in srgb, ${hue} ${pct}%, rgb(var(--color-surface)))`;
        // Лёгкая таблица («Пробные»): месяц всегда раскрыт, без отдельной рамки и без стрелки — таблица прямо в карточке страницы.
        const isOpen = (lightTable || open.has(m.key)) && m.total > 0;
        const paidPct = m.total ? Math.round((m.paid / m.total) * 100) : 0;
        return (
          <section
            key={m.key}
            className={lightTable ? '' : `rounded-card border-[1.5px] px-4 py-3.5 ${plain ? 'border-border' : ''}`}
            style={plain ? undefined : { backgroundColor: mix(14), borderColor: mix(38) }}
          >
            {!hideHeader && (
              <button
                type="button"
                onClick={() => !lightTable && m.total > 0 && toggle(m.key)}
                aria-expanded={isOpen}
                className={`flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${lightTable ? 'cursor-default' : ''}`}
              >
                <span
                  className={`flex shrink-0 items-center justify-center rounded-row text-white ${lightTable ? 'h-9 w-9' : 'h-10 w-10'}`}
                  style={{ backgroundColor: hue }}
                >
                  <HeaderIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="flex-1">
                  <span className={`block font-bold ${lightTable ? 'text-body' : 'text-title'}`} style={{ color: `color-mix(in srgb, ${hue} 60%, rgb(var(--color-text)))` }}>
                    {m.label}
                  </span>
                  {!compactHeader && (
                    <span className="block text-small text-muted">
                      {m.total} {pluralize(m.total, ['пробный', 'пробных', 'пробных'])}
                      {m.total > 0 && ` · оплатили ${m.paid} · ушли ${m.left} · в процессе ${m.wip}`}
                    </span>
                  )}
                </span>
                {m.total > 0 && (
                  <>
                    {!hideConversion && (
                      <>
                        <span className="hidden h-2 w-32 shrink-0 rounded-badge sm:block" style={{ backgroundColor: mix(22) }} aria-hidden="true">
                          <span className="block h-full rounded-badge" style={{ width: `${paidPct}%`, backgroundColor: hue }} />
                        </span>
                        <span className="w-10 shrink-0 text-right text-small font-bold text-text">{paidPct}%</span>
                      </>
                    )}
                    {!lightTable && (
                      <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    )}
                  </>
                )}
              </button>
            )}

            {isOpen && lightTable && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-control text-text">
                  <thead>
                    <tr className="bg-chip text-left text-caption uppercase tracking-wide text-muted">
                      {['Дата', 'Имя', 'Телефон', 'Учитель', 'Группа', 'Комментарий'].map((h) => (
                        <th key={h} className="px-2 py-2 font-bold first:rounded-l-row last:rounded-r-row">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.groups
                      .flatMap(([, list]) => list)
                      .map((r) => {
                        // Оплатил, ушёл или в архиве — остаётся в списке, вся строка зачёркнута, в комментарии «Оплатил» / «Удалён».
                        const done = r.outcome.key !== 'wip' || Boolean(r.student.isArchived);
                        const doneLabel = r.outcome.key === 'paid' && !r.student.isArchived ? 'Оплатил' : 'Удалён';
                        return (
                        <tr
                          key={r.student.id}
                          onClick={() => navigate(`/students/${r.student.id}`)}
                          className={`cursor-pointer border-b border-border last:border-0 hover:bg-surface-alt ${
                            done ? '[&>td]:text-muted [&>td]:line-through' : ''
                          }`}
                        >
                          <td className="whitespace-nowrap px-2 py-3">{`${r.date.getDate()} ${MONTHS_SHORT[r.date.getMonth()]}`}</td>
                          <td className="px-2 py-3 font-bold">{r.student.fullName}</td>
                          <td className="whitespace-nowrap px-2 py-3 text-muted">{formatPhone(r.student.phone)}</td>
                          <td className="px-2 py-3">{r.teacher}</td>
                          <td className="px-2 py-3">{r.enr?.groupCode ? <Badge variant="group-code">{r.enr.groupCode}</Badge> : '—'}</td>
                          <td className="px-1 py-2">
                            {done ? (
                              <span className="block px-2 text-control">
                                {doneLabel}
                                {r.student.trialComment ? ` · ${r.student.trialComment}` : ''}
                              </span>
                            ) : (
                              <TrialCommentCell student={r.student} />
                            )}
                          </td>
                        </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {isOpen && !lightTable && (
              <div className="mt-3 overflow-x-auto">
                <div className="min-w-[44rem]">
                  <div className={`${flat ? ROW_GRID_FLAT : ROW_GRID} px-3 pt-1 text-caption text-muted`}>
                    {flat && <span>Дата</span>}
                    <span>Имя</span>
                    <span>Телефон</span>
                    {!flat && <span>Дата</span>}
                    <span>Учитель</span>
                    <span>Группа</span>
                    <span>Статус</span>
                  </div>
                  {m.groups.map(([teacher, rows]) => (
                    <div key={teacher} className="mb-2 last:mb-0">
                      {!flat && (
                        <p className="mb-1.5 mt-2 px-1 text-small font-bold" style={{ color: `color-mix(in srgb, ${hue} 60%, rgb(var(--color-text)))` }}>
                          {teacher} · {rows.length}
                        </p>
                      )}
                      {rows.map((r) => (
                        <button
                          key={r.student.id}
                          type="button"
                          onClick={() => navigate(`/students/${r.student.id}`)}
                          className={`mb-1.5 ${flat ? ROW_GRID_FLAT : ROW_GRID} w-full rounded-row border border-border bg-card px-3 py-2.5 text-left text-control text-text transition hover:border-border-strong hover:shadow-card`}
                        >
                          {flat && <span>{formatDate(r.student.trialDate)}</span>}
                          <span className="truncate font-bold">{r.student.fullName}</span>
                          <span className="truncate text-muted">{formatPhone(r.student.phone)}</span>
                          {!flat && <span>{formatDate(r.student.trialDate)}</span>}
                          <span className="truncate text-muted">{r.teacher}</span>
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
