// src/pages/TasksPage.jsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isToday, isTomorrow, format, subDays, subMonths, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { AlertTriangle, Clock, CalendarDays, Settings } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { COLUMNS } from '../components/leads/columns.js';
import { stageDeadline, overdueReasonLabel } from '../lib/leadFunnel.js';
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

/**
 * Уровни приоритета задач — с чего начинать (1 — самое срочное):
 * 1 «Дожим» и «Пробный проведён» (лид вот-вот заплатит, каждая задержка
 * стоит денег), 2 «Пробный назначен», 3 новый лид, 4 просроченная задача
 * на остальных стадиях, 5 всё прочее. Стадия сильнее просрочки: просроченный
 * «Дожим» — уровень 1, не 4. Метка (цвет рамки + «приоритет N» на линии
 * рамки) только у 1–4; у 5 карточка без пометок.
 */
const PRIORITY_STYLES = {
  1: { color: '#C0392B', label: 'приоритет 1' },
  2: { color: '#E5842B', label: 'приоритет 2' },
  3: { color: '#D4A017', label: 'приоритет 3' },
  4: { color: '#7C5CBF', label: 'приоритет 4' },
};

function priorityLevel(lead, isOverdue) {
  const stage = lead.funnelStage ?? 'new';
  if (stage === 'closing' || stage === 'trial_completed') return 1;
  if (stage === 'trial_scheduled') return 2;
  if (stage === 'new') return 3;
  return isOverdue ? 4 : 5;
}

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
function DoneStrip({ count }) {
  const rows = Math.min(Math.floor(count / DAILY_GOAL) + 1, 5);
  return (
    <div className="mb-4 rounded-2xl bg-[#F0F0EF] p-4">
      <p className="mb-3 text-[22px] font-bold leading-tight text-[#111]">
        Выполнено сегодня: {count} из {DAILY_GOAL}
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
function ActivityChart({ counts }) {
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
        <p className="text-[15px] font-bold text-[#111]">Активность: {total} выполнено</p>
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
                      background: b.value > 0 ? '#3865C9' : EMPTY_SQUARE,
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

  const activity = useMemo(() => {
    const counts = new Map();
    for (const lead of allLeads) {
      if (scopedOperatorUid && lead.assignedOperator !== scopedOperatorUid) continue;
      for (const list of [lead.callAttempts, lead.closingTouchLog, lead.unreachableAttempts]) {
        for (const e of list ?? []) {
          const ms = msOf(e.at);
          if (!ms) continue;
          const key = format(new Date(ms), 'yyyy-MM-dd');
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [allLeads, scopedOperatorUid]);
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const doneToday = activity.get(todayKey) ?? 0;

  // Уведомление об уровне — раз в день и только по СВОИМ задачам
  // (менеджер, смотрящий «Все», не должен получать чужое достижение).
  useEffect(() => {
    if (scopedOperatorUid !== user.uid || doneToday < DAILY_GOAL) return;
    const flag = `icon-crm:dominator:${user.uid}:${todayKey}`;
    try {
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, '1');
    } catch {
      // без localStorage — просто покажем ещё раз при следующем заходе
    }
    showToast('Вы перешли на уровень «Доминатор»');
  }, [doneToday, scopedOperatorUid, user.uid, todayKey, showToast]);

  const buckets = useMemo(() => {
    const now = new Date();
    const result = { overdue: [], today: [], tomorrow: [] };
    for (const lead of allLeads) {
      if (lead.boardHiddenAt) continue;
      if (scopedOperatorUid && lead.assignedOperator !== scopedOperatorUid) continue;
      const deadline = stageDeadline(lead);
      if (!deadline) continue;
      // Свежий лид (стадия «Новый лид» — первого касания ещё не было) —
      // всегда задача «на сегодня», даже если SLA-дедлайн уже прошёл или лид
      // пришёл вчера — иначе он тонул бы среди сотен старых просрочек. Как
      // только оператор сделает первое касание, лид уходит из «Новый лид» и
      // задача считается по обычному дедлайну.
      if ((lead.funnelStage ?? 'new') === 'new') {
        result.today.push({ lead, deadline, level: priorityLevel(lead, false), pinnedToday: true });
        continue;
      }
      const isOverdue = deadline.getTime() < now.getTime();
      const item = { lead, deadline, level: priorityLevel(lead, isOverdue), pinnedToday: false };
      if (isOverdue) result.overdue.push(item);
      else if (isToday(deadline)) result.today.push(item);
      else if (isTomorrow(deadline)) result.tomorrow.push(item);
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => a.level - b.level || a.deadline - b.deadline);
    }
    return result;
  }, [allLeads, scopedOperatorUid]);

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

      <DoneStrip count={doneToday} />
      <ActivityChart counts={activity} />

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
                {buckets[bucket.key].length === 0 ? (
                  <p className="py-6 text-center text-[13px] text-muted">Пусто</p>
                ) : (
                  buckets[bucket.key].map(({ lead, deadline, level, pinnedToday }) => {
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
                        className="shrink-0 rounded-field bg-[#0088CC] px-3 py-1.5 text-[12px] font-bold text-white hover:bg-[#0077B3]"
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
