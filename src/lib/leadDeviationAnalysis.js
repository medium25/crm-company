import { LEAD_CHECKLIST_ITEMS } from './leadChecklist.js';
import { stageDeadline } from './leadFunnel.js';
import { pluralize } from './format.js';

/**
 * Разбор отклонений от «идеальной картины» ведения лида — считается в
 * момент отказа (см. DeclineLeadModal), по стадии, с которой лид
 * отказывается (`lead.funnelStage`). Каждый пункт — минус балл(ы),
 * итог — просто сумма, без скрытого веса. Ничего не пишет в БД сама,
 * только читает уже сохранённые поля лида.
 *
 * Задача не «наказать» оператора, а показать конкретно, где разговор/
 * сопровождение разошлось со стандартом — оператор сам решает, было ли
 * это реальной причиной отказа.
 */

const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : null);

// Та же сетка дедлайнов звонков, что и nextCallDueAt в leadFunnel.js
// (2 попытки сегодня/2 завтра/1 послезавтра), но как чистая функция от
// даты-якоря — nextCallDueAt всегда считает от текущего момента, здесь
// нужно «а каким должен был быть дедлайн ТОГДА».
function callGridDeadline(anchorDate, attemptIndexBefore) {
  const daysAhead = attemptIndexBefore < 2 ? 0 : attemptIndexBefore < 4 ? 1 : 2;
  const d = new Date(anchorDate);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(18, 0, 0, 0);
  return d;
}

/**
 * Ожидаемый дедлайн попытки звонка №i (0-индекс). Если на самой попытке
 * сохранён `expectedBy` (пишем с этой фичи, см. LeadsPage.markAttempt) —
 * берём его, это точно. Для старых записей без `expectedBy` —
 * приблизительный расчёт по стандартной сетке от времени предыдущей
 * попытки (если сетку не сдвигали вручную, совпадёт).
 */
function callAttemptDeadline(attempts, i) {
  const expectedBy = toDate(attempts[i]?.expectedBy);
  if (expectedBy) return expectedBy;
  if (i === 0) return null; // 1-я попытка — дедлайн SLA (15 мин), не звонковая сетка, не оцениваем
  const anchor = toDate(attempts[i - 1]?.at);
  if (!anchor) return null;
  // n в сетке — число попыток, сделанных ДО этой (см. nextCallDueAt в
  // leadFunnel.js: n = attempts.length на момент расчёта дедлайна СЛЕДУЮЩЕЙ
  // попытки) — то есть ровно i при 0-индексе, не i-1.
  return callGridDeadline(anchor, i);
}

function checklistDeviation(lead) {
  const numbered = LEAD_CHECKLIST_ITEMS.map((item, idx) => ({ ...item, num: idx + 1 }));
  const unchecked = numbered.filter((item) => !lead.checklist?.[item.key]);
  if (unchecked.length === 0) return null;
  return {
    label: `не пройдены пункты чек-листа: ${unchecked.map((u) => u.num).join(', ')}`,
    points: -unchecked.length,
  };
}

function lateCallsDeviation(lead) {
  const attempts = lead.callAttempts ?? [];
  const late = [];
  attempts.forEach((a, i) => {
    const deadline = callAttemptDeadline(attempts, i);
    const at = toDate(a.at);
    if (deadline && at && at > deadline) late.push(i + 1);
  });
  if (late.length === 0) return null;
  return {
    label: `просрочка при ${pluralize(late.length, ['звонке', 'звонках', 'звонках'])} ${late.join(', ')}`,
    points: -late.length,
  };
}

function earlyDeclineDeviation(lead) {
  const attempts = lead.callAttempts ?? [];
  if (lead.lostReason === 'cold_lead') return null; // это и есть честные 5 попыток, не отклонение
  if (attempts.length === 0 || attempts.length >= 5) return null;
  return {
    label: `отказ после ${attempts.length} из 5 попыток дозвона`,
    points: -1,
  };
}

function trialConfirmDeviation(lead) {
  if (lead.callReminderDone) return null;
  return {
    label: 'не подтверждён пробный отметкой «Напомнили через звонок»',
    points: -1,
  };
}

function unreachableDeviation(lead) {
  const attempts = lead.unreachableAttempts ?? [];
  const fails = attempts.filter((a) => a.result === 'fail');
  if (fails.length === 0) return null;
  return {
    label: `не удавалось дозвониться (${fails.length} ${pluralize(fails.length, ['неудачная попытка', 'неудачные попытки', 'неудачных попыток'])})`,
    points: -1,
  };
}

function closingIncompleteDeviation(lead) {
  const n = lead.closingTouchNumber ?? 0;
  if (n >= 2) return null;
  return {
    label: `дожим не завершён (${n} из 2 касаний)`,
    points: -1,
  };
}

function overdueAtDeclineDeviation(lead) {
  const deadline = stageDeadline(lead);
  if (!deadline) return null;
  if (deadline >= new Date()) return null;
  return {
    label: 'карточка была просрочена на момент отказа',
    points: -1,
  };
}

/**
 * @param {Object} lead документ лида ДО отказа (funnelStage — стадия, с
 * которой отказывают)
 * @returns {{items: Array<{label: string, points: number}>, totalPoints: number}}
 */
export function analyzeLeadDeviations(lead) {
  const stage = lead.funnelStage ?? 'new';
  const items = [];

  if (stage === 'new' || stage === 'calling') {
    items.push(checklistDeviation(lead), lateCallsDeviation(lead), earlyDeclineDeviation(lead));
  }
  if (stage === 'trial_scheduled') {
    items.push(trialConfirmDeviation(lead), unreachableDeviation(lead));
  }
  if (stage === 'closing') {
    items.push(closingIncompleteDeviation(lead), unreachableDeviation(lead));
  }
  items.push(overdueAtDeclineDeviation(lead));

  const filtered = items.filter(Boolean);
  const totalPoints = filtered.reduce((sum, item) => sum + item.points, 0);
  return { items: filtered, totalPoints };
}
