import { format as formatDateFns } from 'date-fns';
import { ru } from 'date-fns/locale';

/**
 * @param {number} amount целое число в сумах
 * @returns {string} "840 000 UZS" (неразрывные пробелы)
 */
export function formatMoney(amount) {
  const grouped = Math.round(Math.abs(amount))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${amount < 0 ? '−' : ''}${grouped} UZS`;
}

/**
 * @param {number} amount
 * @returns {string} "−240 000 UZS", знак всегда явный
 */
export function formatMoneySigned(amount) {
  const sign = amount > 0 ? '+' : '';
  return `${sign}${formatMoney(amount)}`;
}

/**
 * @param {string} phone цифры без плюса, напр. "998940189956"
 * @returns {string} "94 018 99 56"
 */
export function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith('998') ? digits.slice(3) : digits.slice(-9);
  const m = local.match(/^(\d{2})(\d{3})(\d{2})(\d{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]}` : local;
}

/**
 * @param {import('firebase/firestore').Timestamp} ts
 * @returns {string} "24.07.2026"
 */
export function formatDate(ts) {
  if (!ts) return '';
  return formatDateFns(ts.toDate(), 'dd.MM.yyyy', { locale: ru });
}

/**
 * @param {import('firebase/firestore').Timestamp} ts
 * @returns {string} "24 июля 2026 г."
 */
export function formatDateLong(ts) {
  if (!ts) return '';
  return `${formatDateFns(ts.toDate(), 'd MMMM yyyy', { locale: ru })} г.`;
}

/**
 * @param {import('firebase/firestore').Timestamp} ts
 * @returns {string} "24.07.2026 14:44:24"
 */
export function formatDateTime(ts) {
  if (!ts) return '';
  return formatDateFns(ts.toDate(), 'dd.MM.yyyy HH:mm:ss', { locale: ru });
}

/**
 * @param {string} month "2026-07"
 * @returns {string} "июль 2026"
 */
export function formatMonth(month) {
  const [year, m] = month.split('-').map(Number);
  return formatDateFns(new Date(year, m - 1, 1), 'LLLL yyyy', { locale: ru });
}

const SCHEDULE_TYPE_LABELS = {
  even: 'Чётные дни',
  odd: 'Нечётные дни',
  weekdays: 'По дням недели',
};

/**
 * @param {'even'|'odd'|'weekdays'} type
 * @returns {string}
 */
export function formatScheduleType(type) {
  return SCHEDULE_TYPE_LABELS[type] ?? type;
}

/**
 * @param {number} n
 * @param {[string, string, string]} forms [1 месяц, 2 месяца, 5 месяцев]
 * @returns {string}
 */
export function pluralize(n, forms) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
