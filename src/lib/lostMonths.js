import { format, startOfMonth, addMonths, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';

/** Сколько последних месяцев (включая текущий) показываем карточками в «Отказ» до загрузки. */
export const LOST_MONTHS_SHOWN = 4;

/**
 * Последние `n` календарных месяцев (новые впереди) — для карточек «Отказ» по месяцам.
 * @param {number} [n]
 * @param {Date} [now]
 * @returns {Array<{key: string, label: string, start: Date, end: Date, isCurrent: boolean}>}
 */
export function recentMonths(n = LOST_MONTHS_SHOWN, now = new Date()) {
  const cur = startOfMonth(now);
  return Array.from({ length: n }, (_, i) => {
    const start = subMonths(cur, i);
    const label = format(start, 'LLLL yyyy', { locale: ru });
    return {
      key: format(start, 'yyyy-MM'),
      label: label.charAt(0).toUpperCase() + label.slice(1),
      start,
      end: addMonths(start, 1),
      isCurrent: i === 0,
    };
  });
}
