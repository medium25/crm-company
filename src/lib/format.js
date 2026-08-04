import { format as formatDateFns, differenceInMonths, differenceInCalendarDays, addMonths } from 'date-fns';
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

/**
 * Короткая форма для подписей оси X графика выручки.
 * @param {string} month "2026-07"
 * @returns {string} "июль 26"
 */
export function formatMonthShort(month) {
  const [year, m] = month.split('-').map(Number);
  return formatDateFns(new Date(year, m - 1, 1), 'LLL yy', { locale: ru });
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
 * Сколько учится — «X месяцев Y дней» от даты добавления до даты окончания
 * (по умолчанию — сегодня; для ушедших передавать `leftAt`).
 * @param {import('firebase/firestore').Timestamp} fromTs
 * @param {import('firebase/firestore').Timestamp|null} [toTs] по умолчанию — сейчас
 * @returns {string} "1 год 3 месяца 12 дней" | "18 дней" | "—"
 */
export function formatDuration(fromTs, toTs) {
  if (!fromTs) return '—';
  const from = fromTs.toDate();
  const to = toTs ? toTs.toDate() : new Date();
  if (to <= from) return '0 дней';

  // differenceInMonths — точное число ПОЛНЫХ месяцев (учитывает день месяца,
  // не только пересечение календарных границ), иначе остаток в днях после
  // addMonths(from, totalMonths) мог уйти в отрицательные числа и обнулиться.
  const totalMonths = Math.max(0, differenceInMonths(to, from));
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const days = Math.max(0, differenceInCalendarDays(to, addMonths(from, totalMonths)));

  const parts = [];
  if (years > 0) parts.push(`${years} ${pluralize(years, ['год', 'года', 'лет'])}`);
  if (months > 0) parts.push(`${months} ${pluralize(months, ['месяц', 'месяца', 'месяцев'])}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} ${pluralize(days, ['день', 'дня', 'дней'])}`);
  return parts.join(' ');
}

/**
 * Число полных месяцев обучения (для усреднения по списку студентов).
 * @param {import('firebase/firestore').Timestamp} fromTs
 * @param {import('firebase/firestore').Timestamp|null} [toTs] по умолчанию — сейчас
 * @returns {number}
 */
export function monthsElapsed(fromTs, toTs) {
  if (!fromTs) return 0;
  const from = fromTs.toDate();
  const to = toTs ? toTs.toDate() : new Date();
  return Math.max(0, differenceInMonths(to, from));
}

/**
 * Среднее число месяцев обучения по списку студентов — "5.3 месяца".
 * Студенты, которые учатся у нас больше 12 месяцев, в среднее не входят —
 * после года они переходят на бесплатное обучение и не характеризуют
 * обычный срок обучения.
 * @param {Array<{createdAt: import('firebase/firestore').Timestamp, leftAt?: import('firebase/firestore').Timestamp|null}>} students
 * @returns {string} "5.3 месяца" | "—" (пустой список или все — больше 12 месяцев)
 */
export function formatAvgMonths(students) {
  if (!students || students.length === 0) return '—';
  const eligible = students.filter((st) => monthsElapsed(st.createdAt, st.leftAt ?? null) <= 12);
  if (eligible.length === 0) return '—';
  const total = eligible.reduce((sum, st) => sum + monthsElapsed(st.createdAt, st.leftAt ?? null), 0);
  const avg = total / eligible.length;
  const rounded = Math.round(avg * 10) / 10;
  return `${rounded} ${pluralize(Math.round(avg), ['месяц', 'месяца', 'месяцев'])}`;
}

/**
 * Осталось до дедлайна заморозки — «3 дня» | «сегодня» | «просрочено на N дней» | «—» (дедлайн не указан).
 * @param {import('firebase/firestore').Timestamp|null} deadlineTs
 * @returns {string}
 */
export function formatDaysLeft(deadlineTs) {
  if (!deadlineTs) return '—';
  const days = differenceInCalendarDays(deadlineTs.toDate(), new Date());
  if (days > 0) return `${days} ${pluralize(days, ['день', 'дня', 'дней'])}`;
  if (days === 0) return 'сегодня';
  const overdue = Math.abs(days);
  return `просрочено на ${overdue} ${pluralize(overdue, ['день', 'дня', 'дней'])}`;
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
