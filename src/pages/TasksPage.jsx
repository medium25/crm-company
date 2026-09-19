// src/pages/TasksPage.jsx
import { useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isToday, isTomorrow, format, subDays, subMonths, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { AlertTriangle, Clock, CalendarDays } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { COLUMNS } from '../components/leads/columns.js';
import { stageDeadline, overdueReasonLabel } from '../lib/leadFunnel.js';
import { formatRelativeDeadline } from '../lib/format.js';

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

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// Светло-синий у первого квадрата → тёмно-синий у последнего (в каждой строке).
function squareColor(i, n) {
  const t = i / (n - 1);
  return `rgb(${lerp(191, 31, t)},${lerp(211, 79, t)},${lerp(245, 191, t)})`;
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
    <div className="mb-4 rounded-2xl bg-[#F0F0EE] p-4">
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
                  style={{ background: i < filled ? squareColor(i, DAILY_GOAL) : '#DCDCDA' }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** График активности по выполненным задачам: неделя (7 дней) / месяц (30 дней) / год (12 месяцев). */
function ActivityChart({ counts }) {
  const [period, setPeriod] = useState('week');
  const bars = useMemo(() => {
    const now = new Date();
    if (period === 'year') {
      const byMonth = new Map();
      for (const [key, n] of counts) byMonth.set(key.slice(0, 7), (byMonth.get(key.slice(0, 7)) ?? 0) + n);
      return Array.from({ length: 12 }, (_, i) => {
        const d = subMonths(startOfMonth(now), 11 - i);
        return { label: format(d, 'LLL', { locale: ru }), value: byMonth.get(format(d, 'yyyy-MM')) ?? 0, title: format(d, 'LLLL yyyy', { locale: ru }) };
      });
    }
    const days = period === 'week' ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = subDays(now, days - 1 - i);
      const showLabel = period === 'week' || i % 5 === 0 || i === days - 1;
      return {
        label: showLabel ? format(d, period === 'week' ? 'EEEEEE' : 'd', { locale: ru }) : '',
        value: counts.get(format(d, 'yyyy-MM-dd')) ?? 0,
        title: format(d, 'd MMMM', { locale: ru }),
      };
    });
  }, [counts, period]);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const total = bars.reduce((sum, b) => sum + b.value, 0);

  return (
    <div className="mb-6 rounded-2xl bg-[#F0F0EE] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-bold text-[#111]">Активность: {total} выполнено</p>
        <div className="flex gap-1 rounded-full bg-[#DCDCDA] p-0.5">
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
      <div className="flex h-32 items-end gap-[3px]">
        {bars.map((b, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${b.title}: ${b.value}`}>
            {(period !== 'month') && b.value > 0 && <span className="text-[10px] text-[#8a8a86]">{b.value}</span>}
            <div
              className="w-full rounded-t-[3px]"
              style={{ height: `${Math.max(b.value > 0 ? 4 : 2, (b.value / max) * 88)}%`, background: b.value > 0 ? squareColor(i, bars.length) : '#DCDCDA' }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {bars.map((b, i) => (
          <span key={i} className="flex-1 text-center text-[10px] text-[#8a8a86]">{b.label}</span>
        ))}
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
