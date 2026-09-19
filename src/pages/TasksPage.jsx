// src/pages/TasksPage.jsx
import { useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isToday, isTomorrow } from 'date-fns';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { AlertTriangle, Clock, CalendarDays } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useAuth } from '../hooks/useAuth.js';
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

  const buckets = useMemo(() => {
    const now = new Date();
    const result = { overdue: [], today: [], tomorrow: [] };
    for (const lead of allLeads) {
      if (lead.boardHiddenAt) continue;
      if (scopedOperatorUid && lead.assignedOperator !== scopedOperatorUid) continue;
      const deadline = stageDeadline(lead);
      if (!deadline) continue;
      // Свежий лид (стадия «Новый лид» — первого касания ещё не было) —
      // всегда задача «на сегодня» и в приоритете, даже если SLA-дедлайн
      // уже прошёл или лид пришёл вчера — иначе он тонул бы среди сотен
      // старых просрочек. Как только оператор сделает первое касание,
      // лид уходит из «Новый лид» и задача считается по обычному дедлайну.
      if ((lead.funnelStage ?? 'new') === 'new') {
        result.today.push({ lead, deadline, priority: true });
        continue;
      }
      const item = { lead, deadline, priority: false };
      if (deadline.getTime() < now.getTime()) result.overdue.push(item);
      else if (isToday(deadline)) result.today.push(item);
      else if (isTomorrow(deadline)) result.tomorrow.push(item);
    }
    for (const key of Object.keys(result)) {
      result[key].sort((a, b) => Number(b.priority) - Number(a.priority) || a.deadline - b.deadline);
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
                  buckets[bucket.key].map(({ lead, deadline, priority }) => (
                    <div
                      key={lead.id}
                      className={`relative flex items-center justify-between gap-3 rounded-field border bg-surface p-3 ${
                        priority ? 'border-orange' : 'border-border'
                      }`}
                    >
                      {priority && (
                        <span className="absolute -top-[5px] right-2.5 bg-surface px-1 text-[9px] leading-none text-orange">приоритет</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold leading-snug text-text">{pendingTaskText(lead)}</p>
                        <p className={`mt-0.5 text-[11px] ${bucket.key === 'overdue' ? 'font-bold text-danger' : 'text-muted'}`}>
                          {priority ? 'сегодня' : formatRelativeDeadline(deadline)}
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
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
