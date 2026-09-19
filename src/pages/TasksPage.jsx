// src/pages/TasksPage.jsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isTomorrow, format, subDays, subMonths, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { AlertTriangle, Clock, CalendarDays, Settings, Check } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { COLUMNS } from '../components/leads/columns.js';
import { overdueReasonLabel } from '../lib/leadFunnel.js';
import { priorityLevel, taskPlacement } from '../lib/leadTasks.js';
import { formatRelativeDeadline, pluralize } from '../lib/format.js';

const msOf = (v) => (v?.toDate ? v.toDate().getTime() : v instanceof Date ? v.getTime() : 0);

/**
 * Что именно поставлено сделать — текст «Следующий шаг» (иначе «Что
 * произошло?») из ПОСЛЕДНЕЙ отметки касания по этому лиду (callAttempts/
 * closingTouchLog/unreachableAttempts — какая позже). Нет ни одной отметки
 * (свежий лид) — стандартное «Позвонить в первые 30 минут», тот же текст,
 * что на самой карточке; иначе запасной вариант — причина просрочки по
 * стадии (overdueReasonLabel).
 */
function pendingTaskText(lead) {
  const entries = [...(lead.callAttempts ?? []), ...(lead.closingTouchLog ?? []), ...(lead.unreachableAttempts ?? [])];
  const last = entries.sort((a, b) => msOf(b.at) - msOf(a.at))[0];
  const text = last?.nextStep || last?.outcome;
  if (text) return text;
  if (!last && (lead.funnelStage ?? 'new') === 'new') return 'Позвонить в первые 30 минут';
  return overdueReasonLabel(lead);
}

const allEntriesOf = (lead) =>
  [...(lead.callAttempts ?? []), ...(lead.closingTouchLog ?? []), ...(lead.unreachableAttempts ?? [])]
    .filter((e) => msOf(e.at))
    .sort((a, b) => msOf(a.at) - msOf(b.at));

/**
 * Что было поставлено ДО отметки `entry` — «Следующий шаг» предыдущей
 * отметки (или «Что произошло?», если шага нет). Предыдущей отметки нет —
 * стандартный текст стадии, как на самой карточке (новый лид — «Позвонить в
 * первые 30 минут»).
 */
function taskTextBefore(all, entry, wasStage) {
  const prev = all[all.indexOf(entry) - 1];
  if (prev) return prev.nextStep || prev.outcome || 'Задача';
  return wasStage === 'new' ? 'Позвонить в первые 30 минут' : overdueReasonLabel({ funnelStage: wasStage });
}

/** Метка приоритета (цвет рамки + «приоритет N» на линии рамки) — только у 1–4; у 5 карточка без пометок. Сами уровни — priorityLevel, leadTasks.js. */
const PRIORITY_STYLES = {
  1: { color: '#C0392B', label: 'приоритет 1' },
  2: { color: '#E5842B', label: 'приоритет 2' },
  3: { color: '#D4A017', label: 'приоритет 3' },
  4: { color: '#7C5CBF', label: 'приоритет 4' },
};

const DAILY_GOAL = 40;
const PERIODS = [
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'year', label: 'Год' },
];

// Палитра один в один с эталонным окном (снято с фото): четыре оттенка
// синего от светлого к тёмному. Позиция квадрата в строке → ступень, так
// что слева самые светлые, справа самые тёмные.
const BLUE_STEPS = ['#8EABE5', '#6E93DE', '#4F7BD7', '#3865C9'];
const EMPTY_SQUARE = '#DADAD9';

function squareColor(i, n) {
  return BLUE_STEPS[Math.min(BLUE_STEPS.length - 1, Math.floor((i / n) * BLUE_STEPS.length))];
}

/**
 * Полоса «выполнено сегодня» — 40 квадратов в строку (DAILY_GOAL), по
 * квадрату на задачу, градиент светлый→тёмный. Дошли до 40 — появляется
 * вторая строка (и дальше по строке на каждые 40) и уровень «Доминатор».
 * «Выполненная задача» = отметка касания (callAttempts/closingTouchLog/
 * unreachableAttempts) — отдельной записи «выполнено» в системе нет.
 */
function DoneStrip({ count, name, compact = false }) {
  const rows = Math.min(Math.floor(count / DAILY_GOAL) + 1, 5);
  return (
    <div className={`rounded-2xl bg-[#F0F0EF] p-4 ${compact ? 'mb-3' : 'mb-4'}`}>
      <p className={`font-bold leading-tight text-[#111] ${compact ? 'mb-2 text-[15px]' : 'mb-3 text-[22px]'}`}>
        {name ? `${name} — ` : ''}
        {name ? 'выполнено' : 'Выполнено'} сегодня: {count} из {DAILY_GOAL}
        {count >= DAILY_GOAL && <span className="ml-2 text-[#1F4FBF]">— Доминатор</span>}
      </p>
      <div className="flex flex-col gap-[3px]">
        {Array.from({ length: rows }, (_, r) => {
          const filled = Math.max(0, Math.min(DAILY_GOAL, count - r * DAILY_GOAL));
          return (
            <div key={r} className="flex gap-[3px]">
              {Array.from({ length: DAILY_GOAL }, (_, i) => (
                <div
                  key={i}
                  className="aspect-square flex-1 rounded-[3px]"
                  style={{ background: i < filled ? squareColor(i, DAILY_GOAL) : EMPTY_SQUARE }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WEEKDAYS = [
  { day: 1, label: 'Пн' },
  { day: 2, label: 'Вт' },
  { day: 3, label: 'Ср' },
  { day: 4, label: 'Чт' },
  { day: 5, label: 'Пт' },
  { day: 6, label: 'Сб' },
  { day: 0, label: 'Вс' },
];
const DAYS_OFF_KEY = 'icon-crm:activity-days-off';

// Выходные для графика — личная настройка браузера (getDay(): 0 — вс … 6 — сб);
// по умолчанию воскресенье. Не влияет на саму полосу «выполнено сегодня» и
// на список задач — только на график ниже.
function loadDaysOff() {
  try {
    const raw = localStorage.getItem(DAYS_OFF_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // нет localStorage / битое значение — дефолт ниже
  }
  return [0];
}

/**
 * График активности по выполненным задачам. Неделя — столбики (7 дней),
 * месяц (30 дней) и год (12 месяцев) — линия с точками. Выходные дни
 * (см. daysOff) не рисуются и не входят в сумму.
 */
function ActivityChart({ counts, label }) {
  const [period, setPeriod] = useState('week');
  const [daysOff, setDaysOff] = useState(loadDaysOff);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // Выбранная точка относится к конкретному набору точек — при смене
  // периода/выходных индекс указывал бы уже на другую.
  useEffect(() => {
    setSelected(null);
  }, [period, daysOff]);

  // Подсказка закрывается кликом в любое место, кроме самих точек (клик по
  // точке переключает её же — см. onClick у <g data-dot>).
  useEffect(() => {
    if (selected === null) return undefined;
    const close = (e) => {
      if (!e.target.closest?.('[data-dot]')) setSelected(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [selected]);

  const toggleDayOff = (day) => {
    setDaysOff((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      try {
        localStorage.setItem(DAYS_OFF_KEY, JSON.stringify(next));
      } catch {
        // настройка живёт только до перезагрузки — не критично
      }
      return next;
    });
  };

  const bars = useMemo(() => {
    const now = new Date();
    if (period === 'year') {
      const byMonth = new Map();
      for (const [key, n] of counts) {
        if (daysOff.includes(new Date(`${key}T00:00:00`).getDay())) continue;
        byMonth.set(key.slice(0, 7), (byMonth.get(key.slice(0, 7)) ?? 0) + n);
      }
      return Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(startOfMonth(now), 11 - i);
        return { label: format(d, 'LLL', { locale: ru }), value: byMonth.get(format(d, 'yyyy-MM')) ?? 0, title: format(d, 'LLLL yyyy', { locale: ru }) };
      });
    }
    const days = period === 'week' ? 7 : 30;
    const list = Array.from({ length: days }, (_, i) => subDays(now, days - 1 - i)).filter((d) => !daysOff.includes(d.getDay()));
    return list.map((d, i) => ({
      label: period === 'week' || i % 5 === 0 || i === list.length - 1 ? format(d, period === 'week' ? 'EEEEEE d' : 'd MMM', { locale: ru }) : '',
      value: counts.get(format(d, 'yyyy-MM-dd')) ?? 0,
      title: format(d, 'd MMMM', { locale: ru }),
    }));
  }, [counts, period, daysOff]);
  const total = bars.reduce((sum, b) => sum + b.value, 0);

  // Ширину SVG берём из контейнера — иначе viewBox растягивал бы кружки в
  // овалы. Высота фиксированная.
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 200;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 26;
  const maxValue = Math.max(1, ...bars.map((b) => b.value));
  const rawStep = maxValue / 4;
  const mag = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= rawStep) ?? mag * 10;
  const ticks = Array.from({ length: 5 }, (_, i) => i * step);
  const top = ticks[ticks.length - 1];
  const x = (i) => padL + (bars.length === 1 ? 0 : (i / (bars.length - 1)) * (width - padL - padR));
  const y = (v) => padT + (1 - v / top) * (H - padT - padB);
  const path = bars.map((b, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(b.value).toFixed(1)}`).join(' ');

  return (
    <div className="mb-6 rounded-2xl bg-[#F0F0EF] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-bold text-[#111]">Активность{label ? ` · ${label}` : ''}: {total} выполнено</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-label="Выходные дни для графика"
            title="Выходные дни для графика"
            className={`flex h-7 w-7 items-center justify-center rounded-full ${settingsOpen ? 'bg-white text-[#111]' : 'text-[#8a8a86] hover:bg-[#DADAD9]'}`}
          >
            <Settings className="h-4 w-4" />
          </button>
          <div className="flex gap-1 rounded-full bg-[#DADAD9] p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${period === p.key ? 'bg-white text-[#111]' : 'text-[#8a8a86]'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {settingsOpen && (
        <div className="mb-3">
          <p className="mb-1.5 text-[12px] text-[#8a8a86]">Выходные — не показываются в графике и не входят в сумму:</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((w) => (
              <button
                key={w.day}
                type="button"
                onClick={() => toggleDayOff(w.day)}
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${daysOff.includes(w.day) ? 'bg-[#3865C9] text-white' : 'bg-[#DADAD9] text-[#8a8a86]'}`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div ref={wrapRef} className="w-full">
        {period === 'week' ? (
          <div>
            <div className="flex h-40 items-end gap-2">
              {bars.map((b, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.title}: ${b.value}`}>
                  {b.value > 0 && <span className="text-[11px] text-[#8a8a86]">{b.value}</span>}
                  <div
                    className="w-full rounded-t-[4px]"
                    style={{
                      height: `${Math.max(b.value > 0 ? 4 : 2, (b.value / maxValue) * 84)}%`,
                      background: b.value > 0 ? BLUE_STEPS[0] : EMPTY_SQUARE,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-2">
              {bars.map((b, i) => (
                <span key={i} className="flex-1 text-center text-[11px] text-[#8a8a86]">{b.label}</span>
              ))}
            </div>
          </div>
        ) : (
          <svg width={width} height={H} role="img" aria-label="График активности по выполненным задачам">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="#DADAD9" strokeWidth="1" />
                <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#8a8a86">{t}</text>
              </g>
            ))}
            {bars.map((b, i) => (
              <line key={`v${i}`} x1={x(i)} x2={x(i)} y1={padT} y2={H - padB} stroke="#E4E4E3" strokeWidth="1" />
            ))}
            <path d={path} fill="none" stroke="#3865C9" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {bars.map((b, i) => (
              <g
                key={`c${i}`}
                data-dot
                onClick={() => setSelected((cur) => (cur === i ? null : i))}
                className="cursor-pointer"
              >
                <circle cx={x(i)} cy={y(b.value)} r="11" fill="transparent" />
                <circle
                  cx={x(i)}
                  cy={y(b.value)}
                  r={selected === i ? 6 : 4.5}
                  fill={selected === i ? '#3865C9' : '#F0F0EF'}
                  stroke="#3865C9"
                  strokeWidth="2"
                />
              </g>
            ))}
            {selected !== null && bars[selected] && (() => {
              const b = bars[selected];
              const text = `${b.title}: ${b.value} ${pluralize(b.value, ['задача', 'задачи', 'задач'])}`;
              const w = text.length * 6 + 16;
              const cx = Math.min(Math.max(x(selected), w / 2 + 2), width - w / 2 - 2);
              const cy = Math.max(y(b.value) - 30, 2);
              return (
                <g pointerEvents="none">
                  <rect x={cx - w / 2} y={cy} width={w} height={22} rx="6" fill="#111" />
                  <text x={cx} y={cy + 15} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">{text}</text>
                </g>
              );
            })()}
            {bars.map((b, i) =>
              b.label ? (
                <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor={i === bars.length - 1 ? 'end' : 'middle'} fontSize="11" fill="#6b6b67">{b.label}</text>
              ) : null,
            )}
          </svg>
        )}
      </div>
    </div>
  );
}

const timeOf = (e) => format(new Date(msOf(e.at)), 'HH:mm');

/**
 * Выполненная задача — остаётся в колонке до конца дня (на следующий день
 * её уже нет: список строится только по отметкам за сегодня). Спереди —
 * имя, задача и «Выполнено»; по клику карточка переворачивается: на
 * обороте все записи зачёркнуты.
 */
function CompletedTaskCard({ lead, taskText, entries }) {
  const [flipped, setFlipped] = useState(false);
  const face = 'col-start-1 row-start-1 [backface-visibility:hidden]';
  const struck = 'text-muted line-through';
  const last = entries[entries.length - 1];
  return (
    <div style={{ perspective: '900px' }}>
      <div
        className="grid transition-transform duration-500"
        style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'none' }}
      >
        <div
          className={`${face} flex items-center justify-between gap-3 rounded-field border border-border bg-surface p-3`}
          style={{ pointerEvents: flipped ? 'none' : 'auto' }}
        >
          <div className="min-w-0">
            <p className="truncate text-[13px] font-bold leading-snug text-text">{lead.fullName}</p>
            <p className="text-[12px] leading-snug text-text">{taskText}</p>
            <p className="mt-0.5 text-[11px] text-muted">сегодня в {timeOf(last)}</p>
          </div>
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="flex shrink-0 items-center gap-1 rounded-field bg-success-bg px-3 py-1.5 text-[12px] font-bold text-success"
          >
            <Check className="h-3.5 w-3.5" />
            Выполнено
          </button>
        </div>
        <div
          className={`${face} rounded-field border border-border bg-surface-alt p-3`}
          style={{ transform: 'rotateY(180deg)', pointerEvents: flipped ? 'auto' : 'none' }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className={`truncate text-[13px] font-bold leading-snug ${struck}`}>{lead.fullName}</p>
            <button type="button" onClick={() => setFlipped(false)} className="shrink-0 text-[11px] text-muted underline hover:text-text">
              Назад
            </button>
          </div>
          <p className={`text-[12px] leading-snug ${struck}`}>{taskText}</p>
          {entries.map((e, i) => (
            <div key={i} className="mt-1.5 border-t border-border pt-1.5">
              <p className={`text-[11px] leading-snug ${struck}`}>
                {timeOf(e)}
                {[e.outcome, e.nextStep].some(Boolean) ? ` · ${[e.outcome, e.nextStep].filter(Boolean).join(' → ')}` : ''}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const BUCKETS = [
  { key: 'overdue', title: 'Просроченные задачи', accent: '#E11D48', icon: AlertTriangle },
  { key: 'today', title: 'Задачи на сегодня', accent: '#2F6FE4', icon: Clock },
  { key: 'tomorrow', title: 'Задачи на завтра', accent: '#34A853', icon: CalendarDays },
];

/**
 * Задачи — единый список «что просрочено / что сегодня / что завтра» по
 * всем лидам филиала сразу, без захода в каждую колонку «Заявок» отдельно.
 * Источник дедлайна/текста задачи — тот же, что красит бейдж просрочки на
 * самой карточке (stageDeadline/overdueReasonLabel, leadFunnel.js), никакой
 * отдельной сущности «задача» в Firestore нет — задача существует ровно
 * до тех пор, пока у лида есть неотработанный дедлайн следующего действия.
 * «Выполнить» не отмечает ничего тут — переводит на доску «Заявки»
 * (/leads?highlight=id), где нужная карточка прокручивается в видимую
 * область и подсвечивается рамкой; действие (звонок/касание/т.п.)
 * отмечается там же, как обычно. Оттуда есть кнопка «← К задачам».
 */
export function TasksPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  // Тот же паттерн, что LeadsPage.jsx — ceo/manager/test видят всех
  // операторов сразу (с фильтром), admin/teacher — только свои задачи.
  const canSeeAllTasks = staff?.role === 'ceo' || staff?.role === 'manager' || staff?.role === 'test';
  const [operatorFilter, setOperatorFilter] = useState('all');

  // Дедлайны утекают сами по себе — без форс-тика задача «на сегодня» не
  // переедет в «просроченные» сама, пока не перерендерится по другой причине.
  const [, forceTick] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(forceTick, 60_000);
    return () => clearInterval(id);
  }, []);

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('funnelStage', 'in', COLUMNS.map((c) => c.key)),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId],
  );
  const { data: allLeads, loading } = useCollection(leadsQuery);

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const operatorOptions = useMemo(
    () => staffList.filter((s) => s.role === 'admin').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [staffList],
  );

  const scopedOperatorUid = !canSeeAllTasks
    ? user.uid
    : operatorFilter === 'mine'
      ? user.uid
      : operatorFilter === 'all'
        ? null
        : operatorFilter;

  // Кто сделал касание — пишется в саму отметку (`by`). У старых отметок
  // поля нет — их относим к оператору, за которым лид закреплён сейчас.
  const activityByUid = useMemo(() => {
    const byUid = new Map();
    for (const lead of allLeads) {
      for (const list of [lead.callAttempts, lead.closingTouchLog, lead.unreachableAttempts]) {
        for (const e of list ?? []) {
          const ms = msOf(e.at);
          const uid = e.by ?? lead.assignedOperator;
          if (!ms || !uid) continue;
          const key = format(new Date(ms), 'yyyy-MM-dd');
          if (!byUid.has(uid)) byUid.set(uid, new Map());
          const counts = byUid.get(uid);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    return byUid;
  }, [allLeads]);

  const activity = useMemo(() => {
    if (scopedOperatorUid) return activityByUid.get(scopedOperatorUid) ?? new Map();
    const total = new Map();
    for (const counts of activityByUid.values()) {
      for (const [key, n] of counts) total.set(key, (total.get(key) ?? 0) + n);
    }
    return total;
  }, [activityByUid, scopedOperatorUid]);
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const doneToday = activity.get(todayKey) ?? 0;
  const myDoneToday = activityByUid.get(user.uid)?.get(todayKey) ?? 0;

  // «Все» у менеджера/CEO — полоса на каждого сотрудника отдельно: все
  // операторы филиала (даже с нулём) + любой, кто сегодня что-то отметил.
  const staffNames = useMemo(() => new Map(staffList.map((s) => [s.id, s.fullName])), [staffList]);
  const perOperator = useMemo(() => {
    const uids = new Set(operatorOptions.map((op) => op.id));
    for (const [uid, counts] of activityByUid) {
      if ((counts.get(todayKey) ?? 0) > 0 && staffNames.has(uid)) uids.add(uid);
    }
    return [...uids]
      .map((uid) => ({ uid, name: staffNames.get(uid) ?? uid, count: activityByUid.get(uid)?.get(todayKey) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [operatorOptions, activityByUid, staffNames, todayKey]);
  const scopedName = scopedOperatorUid && scopedOperatorUid !== user.uid ? staffNames.get(scopedOperatorUid) : null;

  // Уведомление об уровне — раз в день, по СВОЕМУ прогрессу в любом виде
  // страницы (менеджер, смотрящий чужого/«Все», своё достижение тоже получит).
  useEffect(() => {
    if (myDoneToday < DAILY_GOAL) return;
    const flag = `icon-crm:dominator:${user.uid}:${todayKey}`;
    try {
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, '1');
    } catch {
      // без localStorage — просто покажем ещё раз при следующем заходе
    }
    showToast('Вы перешли на уровень «Доминатор»');
  }, [myDoneToday, user.uid, todayKey, showToast]);

  // Выполненные СЕГОДНЯ задачи выбранного сотрудника (или всех): по одной
  // карточке на лид, в той колонке, где задача стояла в момент отметки —
  // берётся из expectedBy первой отметки за день (дедлайн, действовавший до неё).
  const completed = useMemo(() => {
    const result = { overdue: [], today: [], tomorrow: [] };
    for (const lead of allLeads) {
      const all = allEntriesOf(lead);
      const mine = all.filter(
        (e) =>
          format(new Date(msOf(e.at)), 'yyyy-MM-dd') === todayKey &&
          (!scopedOperatorUid || (e.by ?? lead.assignedOperator) === scopedOperatorUid),
      );
      if (mine.length === 0) continue;
      const first = mine[0];
      // Место задачи до отметки. Новые записи несут снимок (wasBucket/
      // wasLevel/wasDeadline, см. taskSnapshot) — берём как есть. У старых
      // восстанавливаем: стадия на момент отметки — по stageHistory (первая
      // отметка по лиду сама по себе ещё не значит «Новый лид» — лид мог
      // прийти сразу в «Дожим»), колонка — по expectedBy.
      const before = (lead.stageHistory ?? [])
        .filter((h) => msOf(h.enteredAt) && msOf(h.enteredAt) < msOf(first.at))
        .sort((x, y) => msOf(x.enteredAt) - msOf(y.enteredAt))
        .at(-1)?.stage;
      const wasStage = first.wasStage ?? before ?? (['new', 'calling'].includes(lead.funnelStage ?? 'new') ? 'new' : lead.funnelStage);
      let bucket = first.wasBucket;
      let level = first.wasLevel;
      let deadlineMs = first.wasDeadline;
      if (!bucket || !level) {
        const expected = msOf(first.expectedBy);
        bucket = 'today';
        if (wasStage !== 'new' && expected) {
          if (expected < msOf(first.at)) bucket = 'overdue';
          else if (isTomorrow(new Date(expected))) bucket = 'tomorrow';
        }
        level = priorityLevel({ funnelStage: wasStage }, bucket === 'overdue');
        deadlineMs = expected || msOf(first.at);
      }
      result[bucket].push({
        done: true,
        lead,
        entries: mine,
        taskText: taskTextBefore(all, first, wasStage),
        level,
        deadlineMs: deadlineMs || msOf(first.at),
      });
    }
    return result;
  }, [allLeads, scopedOperatorUid, todayKey]);

  const buckets = useMemo(() => {
    const now = new Date();
    const result = { overdue: [], today: [], tomorrow: [] };
    for (const lead of allLeads) {
      if (lead.boardHiddenAt) continue;
      if (scopedOperatorUid && lead.assignedOperator !== scopedOperatorUid) continue;
      const placement = taskPlacement(lead, now);
      if (placement) result[placement.bucket].push({ lead, ...placement });
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => a.level - b.level || a.deadline - b.deadline);
    }
    return result;
  }, [allLeads, scopedOperatorUid]);

  // Выполненная карточка не переезжает вниз: встаёт по тому же порядку
  // (приоритет, дедлайн), по которому стояла до отметки.
  const columnItems = useMemo(() => {
    const result = {};
    for (const key of Object.keys(buckets)) {
      result[key] = [
        ...buckets[key].map((it) => ({ ...it, done: false, deadlineMs: it.deadline.getTime() })),
        ...completed[key],
      ].sort((a, b) => a.level - b.level || a.deadlineMs - b.deadlineMs);
    }
    return result;
  }, [buckets, completed]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-text">Задачи</h1>
        {canSeeAllTasks && (
          <DropdownMenu
            items={[
              { label: 'Все', onClick: () => setOperatorFilter('all') },
              { label: 'Только мои', onClick: () => setOperatorFilter('mine') },
              ...operatorOptions.map((op) => ({ label: op.fullName, onClick: () => setOperatorFilter(op.id) })),
            ]}
            trigger={({ ref, toggle }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                className="rounded-full bg-navy px-3 py-1.5 text-[13px] text-white"
              >
                {operatorFilter === 'all'
                  ? 'Все'
                  : operatorFilter === 'mine'
                    ? 'Только мои'
                    : (operatorOptions.find((op) => op.id === operatorFilter)?.fullName ?? 'Все')}
                {' ▾'}
              </button>
            )}
          />
        )}
      </div>

      {canSeeAllTasks && operatorFilter === 'all' ? (
        perOperator.map((op) => <DoneStrip key={op.uid} compact name={op.name} count={op.count} />)
      ) : (
        <DoneStrip count={doneToday} name={scopedName} />
      )}
      <ActivityChart counts={activity} label={canSeeAllTasks && operatorFilter === 'all' ? 'все' : scopedName} />

      {loading ? (
        <p className="text-[13px] text-muted">Загрузка…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {BUCKETS.map((bucket) => (
            <div key={bucket.key} className="flex flex-col rounded-card bg-surface-alt">
              <div className="border-b-2 px-4 py-3" style={{ borderBottomColor: bucket.accent }}>
                <span className="flex items-center gap-1.5 text-[14px] font-bold uppercase tracking-wide text-text">
                  <bucket.icon className="h-4 w-4 shrink-0" style={{ color: bucket.accent }} />
                  {bucket.title}
                  <span className="ml-auto text-[13px] font-bold text-muted">{buckets[bucket.key].length}</span>
                </span>
              </div>
              <div className="flex flex-col gap-2 p-3">
                {columnItems[bucket.key].length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted">Пусто</p>
                ) : (
                  columnItems[bucket.key].map((item) => {
                    if (item.done) {
                      return <CompletedTaskCard key={`done-${item.lead.id}`} lead={item.lead} entries={item.entries} taskText={item.taskText} />;
                    }
                    const { lead, deadline, level, pinnedToday } = item;
                    const mark = PRIORITY_STYLES[level];
                    return (
                    <div
                      key={lead.id}
                      className={`relative flex items-center justify-between gap-3 rounded-field border bg-surface p-3 ${
                        mark ? '' : 'border-border'
                      }`}
                      style={mark ? { borderColor: mark.color } : undefined}
                    >
                      {mark && (
                        <span
                          className="absolute -top-[5px] right-2.5 bg-surface px-1 text-[9px] leading-none"
                          style={{ color: mark.color }}
                        >
                          {mark.label}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold leading-snug text-text">{lead.fullName}</p>
                        <p className="text-[12px] leading-snug text-text">{pendingTaskText(lead)}</p>
                        <p className={`mt-0.5 text-[11px] ${bucket.key === 'overdue' ? 'font-bold text-danger' : 'text-muted'}`}>
                          {pinnedToday ? 'сегодня' : formatRelativeDeadline(deadline)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(`/leads?highlight=${lead.id}`)}
                        className="shrink-0 rounded-field bg-navy px-3 py-1.5 text-[12px] font-bold text-white hover:bg-navy-hover"
                      >
                        Выполнить
                      </button>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
