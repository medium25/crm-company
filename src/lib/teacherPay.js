// src/lib/teacherPay.js
// Чистая логика зарплаты учителя: расчётные периоды (два числа месяца), сумма оплат и зарплата по условиям.
import { addDays, endOfDay, format, getDaysInMonth, startOfDay, subMonths } from 'date-fns';

export const DEFAULT_PAY_PERIOD = { from: 1, to: 31 };
export const PAST_PERIODS = 6;

const clampDay = (year, month0, day) => Math.min(Math.max(1, Math.round(day)), getDaysInMonth(new Date(year, month0, 1)));

/**
 * Период выплаты «за месяц M»: с числа `from` месяца M по число `to` включительно. Если `from` > `to`
 * (например, 5 → 4), период заканчивается в следующем месяце: с 5 октября по 4 ноября. Название периода —
 * месяц, в котором он начался. Число больше длины месяца (31 в ноябре) — последний день месяца.
 * @param {number} year
 * @param {number} month0 0–11 — месяц начала периода
 * @param {{from: number, to: number}} pp
 * @returns {{key: string, start: Date, end: Date}} start — начало суток, end — конец суток (включительно)
 */
export function payPeriodFor(year, month0, pp = DEFAULT_PAY_PERIOD) {
  const start = new Date(year, month0, clampDay(year, month0, pp.from));
  const endMonth = pp.from > pp.to ? new Date(year, month0 + 1, 1) : new Date(year, month0, 1);
  const end = endOfDay(new Date(endMonth.getFullYear(), endMonth.getMonth(), clampDay(endMonth.getFullYear(), endMonth.getMonth(), pp.to)));
  return { key: format(start, 'yyyy-MM'), start: startOfDay(start), end };
}

/** Период, в который попадает `today` (если сегодня между концом одного периода и началом другого — ближайший начавшийся). */
export function currentPayPeriod(today = new Date(), pp = DEFAULT_PAY_PERIOD) {
  const thisMonth = payPeriodFor(today.getFullYear(), today.getMonth(), pp);
  if (today >= thisMonth.start) return thisMonth;
  const prev = subMonths(new Date(today.getFullYear(), today.getMonth(), 1), 1);
  return payPeriodFor(prev.getFullYear(), prev.getMonth(), pp);
}

/** Шесть завершённых периодов перед текущим, от нового к старому. */
export function pastPayPeriods(today = new Date(), pp = DEFAULT_PAY_PERIOD, count = PAST_PERIODS) {
  const cur = currentPayPeriod(today, pp);
  return Array.from({ length: count }, (_, i) => {
    const d = subMonths(new Date(cur.start.getFullYear(), cur.start.getMonth(), 1), i + 1);
    return payPeriodFor(d.getFullYear(), d.getMonth(), pp);
  });
}

/** День, когда период зафиксируется (следующий после конца). */
export const fixationDate = (period) => addDays(startOfDay(period.end), 1);

const amountOf = (p) => Number(p.amount) || 0;

/**
 * Оплаты (type=payment) учителя внутри периода.
 * @param {Array<{teacherId: string, type: string, amount: number, date: {toDate: () => Date}}>} payments
 */
export function paymentsInPeriod(payments, teacherId, period) {
  return payments.filter((p) => {
    if (p.type !== 'payment' || p.teacherId !== teacherId) return false;
    const d = p.date?.toDate?.();
    return d && d >= period.start && d <= period.end;
  });
}

/**
 * Зарплата за период по условиям работы.
 * Процент: сумма оплат каждой группы × процент этой группы (нет процента — 0). Фиксированная: фикс за период.
 * @param {Array<Object>} periodPayments оплаты периода (paymentsInPeriod)
 * @param {{mode: 'percent'|'fixed', groupPercents?: Record<string, number>, fixedAmount?: number}|null|undefined} terms
 * @returns {{total: number, byGroup: Record<string, {paid: number, salary: number}>}}
 */
export function salaryFor(periodPayments, terms) {
  const byGroup = {};
  for (const p of periodPayments) {
    const g = (byGroup[p.groupId] ??= { paid: 0, salary: 0 });
    g.paid += amountOf(p);
  }
  if (terms?.mode === 'fixed') return { total: Math.max(0, Number(terms.fixedAmount) || 0), byGroup };
  let total = 0;
  for (const [groupId, g] of Object.entries(byGroup)) {
    const pct = Number(terms?.groupPercents?.[groupId]) || 0;
    g.salary = Math.round((g.paid * pct) / 100);
    total += g.salary;
  }
  return { total, byGroup };
}

/** Условия заданы: есть режим и (фикс > 0 или хоть один процент > 0). */
export function termsConfigured(terms) {
  if (!terms?.mode) return false;
  if (terms.mode === 'fixed') return Number(terms.fixedAmount) > 0;
  return Object.values(terms.groupPercents ?? {}).some((v) => Number(v) > 0);
}
