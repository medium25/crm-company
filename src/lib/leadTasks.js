// src/lib/leadTasks.js
import { isToday, isTomorrow, differenceInCalendarDays } from 'date-fns';
import { stageDeadline, isTrialDay, contactDueDate } from './leadFunnel.js';

/** Новый лид (стадия «Новый лид»), пришедший сегодня. */
export function isFreshLead(lead) {
  return (lead.funnelStage ?? 'new') === 'new' && Boolean(lead.createdAt?.toDate) && isToday(lead.createdAt.toDate());
}

/**
 * Порядок карточек в колонке «Задач»: сначала свежие (новый лид, пришёл сегодня) —
 * самый новый лид самым первым, выполненная карточка не мешает; дальше по уровню
 * приоритета, дальше по дедлайну. Работает и для живых задач (`deadline` — Date),
 * и для выполненных (`deadlineMs`).
 */
export function compareTasks(a, b) {
  if (a.fresh && b.fresh) return (b.lead?.createdAt?.toMillis?.() ?? 0) - (a.lead?.createdAt?.toMillis?.() ?? 0);
  return (b.fresh ? 1 : 0) - (a.fresh ? 1 : 0) || a.level - b.level || (a.deadlineMs ?? a.deadline.getTime()) - (b.deadlineMs ?? b.deadline.getTime());
}

/**
 * Уровни приоритета задач — с чего начинать (1 — самое срочное):
 * 1 «Дожим» и «Пробный проведён» (лид вот-вот заплатит, каждая задержка
 * стоит денег) и новый лид, что пришёл СЕГОДНЯ (пока горячий), 2 «Пробный
 * назначен», 3 новый лид прошлых дней, 4 просроченная задача
 * на остальных стадиях, 5 всё прочее. Стадия сильнее просрочки: просроченный
 * «Дожим» — уровень 1, не 4.
 * @param {{funnelStage?: string, createdAt?: import('firebase/firestore').Timestamp}} lead
 * @param {boolean} isOverdue
 * @returns {1|2|3|4|5}
 */
export function priorityLevel(lead, isOverdue) {
  const stage = lead.funnelStage ?? 'new';
  if (stage === 'closing' || stage === 'trial_completed') return 1;
  if (stage === 'trial_scheduled') return 2;
  if (stage === 'new') return isFreshLead(lead) ? 1 : 3;
  return isOverdue ? 4 : 5;
}

/**
 * Где лежит задача лида на странице «Задачи»: колонка (просрочено/сегодня/
 * завтра), приоритет и дедлайн. Свежий лид («Новый лид» — первого касания
 * ещё не было) — всегда «сегодня», даже если SLA-дедлайн уже прошёл: иначе
 * он тонул бы среди сотен старых просрочек. null — задачи нет (нет дедлайна
 * или он дальше завтра).
 * @param {Object} lead
 * @param {Date} [now]
 * @returns {{bucket: 'overdue'|'today'|'tomorrow', level: number, deadline: Date, pinnedToday: boolean, fresh?: boolean}|null}
 */
export function taskPlacement(lead, now = new Date()) {
  const stage = lead.funnelStage ?? 'new';
  if (stage === 'new') {
    const deadline = stageDeadline(lead);
    if (!deadline) return null;
    return { bucket: 'today', level: priorityLevel(lead, false), deadline, pinnedToday: true, fresh: isFreshLead(lead) };
  }
  if (stage === 'trial_scheduled') return trialScheduledPlacement(lead, now);
  const deadline = stageDeadline(lead);
  if (!deadline) return null;
  const isOverdue = deadline.getTime() < now.getTime();
  const level = priorityLevel(lead, isOverdue);
  if (isOverdue) return { bucket: 'overdue', level, deadline, pinnedToday: false };
  if (isToday(deadline)) return { bucket: 'today', level, deadline, pinnedToday: false };
  if (isTomorrow(deadline)) return { bucket: 'tomorrow', level, deadline, pinnedToday: false };
  return null;
}

/**
 * «Пробный назначен» — та же логика, что «Просроченные» на доске/«Пробных» (см.
 * groupLeadsByTrialDay в LeadColumn.jsx): просрочено, только если прошёл сам
 * день пробного, или если оператор сам назначил повторный звонок на конкретное
 * время (unreachableNextCallDueAt) и это время уже прошло — реально пропущенное
 * обещание перезвонить. Расплывчатое напоминание «позвонить накануне раннего
 * слота» (contactDueDate — на день раньше самого пробного) само по себе
 * никогда не просрочивает: пока идёт этот день, задача лежит в «Сегодня»/
 * «Завтра», не в «Просроченные» — раньше она попадала туда с первой минуты
 * дня (stageDeadline брал начало суток), даже если до пробного ещё далеко.
 */
function trialScheduledPlacement(lead, now) {
  const trialDate = lead.trialDate?.toDate?.();
  if (!trialDate) return null;
  const unreachableDue = lead.unreachableNextCallDueAt?.toDate?.() ?? null;
  const trialLate = differenceInCalendarDays(now, trialDate) > 0;
  const callbackLate = Boolean(unreachableDue) && unreachableDue.getTime() < now.getTime();
  const isOverdue = trialLate || callbackLate;
  const level = priorityLevel(lead, isOverdue);
  if (isOverdue) {
    return { bucket: 'overdue', level, deadline: trialLate ? trialDate : unreachableDue, pinnedToday: false };
  }
  // День, на который сейчас ориентируемся: назначенный звонок — если он есть, иначе
  // «накануне» для непройденного контактного дня, иначе сам день пробного.
  const dueDay = unreachableDue ?? (isTrialDay(trialDate) && !lead.callReminderDone ? contactDueDate(trialDate) : trialDate);
  if (isToday(dueDay)) return { bucket: 'today', level, deadline: dueDay, pinnedToday: false };
  if (isTomorrow(dueDay)) return { bucket: 'tomorrow', level, deadline: dueDay, pinnedToday: false };
  return null;
}

/**
 * Снимок места задачи на момент отметки — дописывается в саму запись
 * касания, чтобы выполненная карточка на «Задачах» осталась ровно там, где
 * стояла (колонка, приоритет, дедлайн), а не «переезжала» вслед за
 * изменившимся состоянием лида.
 * @param {Object} lead
 * @returns {{wasStage: string, wasBucket: string|null, wasLevel: number|null, wasDeadline: number|null}}
 */
export function taskSnapshot(lead) {
  const p = taskPlacement(lead);
  return { wasStage: lead.funnelStage ?? 'new', wasBucket: p?.bucket ?? null, wasLevel: p?.level ?? null, wasDeadline: p?.deadline.getTime() ?? null };
}
