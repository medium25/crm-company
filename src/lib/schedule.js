import { differenceInMonths, differenceInDays, addMonths, addDays, format } from 'date-fns';
import { collection, doc, getDocs, query, where, writeBatch, Timestamp } from 'firebase/firestore';

/**
 * «Неделя обучения» — прогресс группы от старта до сегодня. Не хранится,
 * вычисляется. Формула из «03 · Бизнес-логика» §2, проверена на 7 группах
 * скриншота 3 (дата съёмки 24.07.2026) — 7 из 7 совпадений. Округление —
 * именно Math.round, floor/ceil ломают часть строк.
 * @param {Date} startDate
 * @param {Date} [today]
 * @returns {{months: number, weeks: number}}
 */
export function trainingWeeks(startDate, today = new Date()) {
  const months = differenceInMonths(today, startDate);
  const days = differenceInDays(today, addMonths(startDate, months));
  const weeks = Math.round(days / 7);
  return { months, weeks };
}

// «Чётные»/«нечётные дни» — не календарная чётность числа месяца, а
// недельный паттерн (3 занятия в неделю): нечётные = пн/ср/пт, чётные =
// вт/чт/сб. getDay(): 0=вс,1=пн,2=вт,3=ср,4=чт,5=пт,6=сб.
const ODD_WEEKDAYS = [1, 3, 5];
const EVEN_WEEKDAYS = [2, 4, 6];

/**
 * @param {Date} date
 * @param {import('../types.js').GroupSchedule} schedule
 * @returns {boolean}
 */
export function matchesSchedule(date, schedule) {
  if (schedule.type === 'even') return EVEN_WEEKDAYS.includes(date.getDay());
  if (schedule.type === 'odd') return ODD_WEEKDAYS.includes(date.getDay());
  if (schedule.type === 'weekdays') return (schedule.weekdays ?? []).includes(date.getDay());
  return false;
}

/**
 * Все даты уроков группы в диапазоне [from, to] включительно, за вычетом
 * праздников.
 * @param {import('../types.js').GroupSchedule} schedule
 * @param {Date} from
 * @param {Date} to
 * @param {string[]} [holidays] даты-строки "yyyy-MM-dd"
 * @returns {Date[]}
 */
export function scheduleDatesInRange(schedule, from, to, holidays = []) {
  const dates = [];
  let cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor <= end) {
    const dateKey = format(cursor, 'yyyy-MM-dd');
    if (matchesSchedule(cursor, schedule) && !holidays.includes(dateKey)) {
      dates.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/**
 * Количество уроков группы по расписанию в диапазоне — используется для
 * частичного списания первого месяца (см. «03 · Бизнес-логика» §3.2).
 * @param {import('../types.js').GroupSchedule} schedule
 * @param {Date} from
 * @param {Date} to
 * @param {string[]} [holidays]
 * @returns {number}
 */
export function lessonsInRange(schedule, from, to, holidays = []) {
  return scheduleDatesInRange(schedule, from, to, holidays).length;
}

const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);

/**
 * Пишет недостающие документы уроков для уже посчитанных дат. Общий для
 * `generateLessons` (скользящее окно) и `generateLessonsForMonth` (точечная
 * догенерация) — оба идемпотентны по одному и тому же ID урока
 * `{groupId}_{yyyy-MM-dd}`, поэтому существующие уроки (включая `held`/
 * `cancelled`) никогда не перезаписываются.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} group
 * @param {Date[]} dates
 * @returns {Promise<{created: number}>}
 */
async function writeMissingLessons(db, group, dates) {
  const existingSnap = await getDocs(query(collection(db, 'lessons'), where('groupId', '==', group.id)));
  const existingIds = new Set(existingSnap.docs.map((d) => d.id));

  const toCreate = dates
    .map((date) => ({ date, id: `${group.id}_${format(date, 'yyyy-MM-dd')}` }))
    .filter(({ id }) => !existingIds.has(id));

  let created = 0;
  for (let i = 0; i < toCreate.length; i += 400) {
    const chunk = toCreate.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const { date, id } of chunk) {
      batch.set(doc(db, 'lessons', id), {
        branchId: group.branchId,
        groupId: group.id,
        groupCode: group.code,
        teacherId: group.teacherId,
        date: Timestamp.fromDate(date),
        dateKey: format(date, 'yyyy-MM-dd'),
        month: format(date, 'yyyy-MM'),
        status: 'planned',
        topic: '',
        cancelReason: null,
        markedBy: null,
        markedAt: null,
      });
    }
    // eslint-disable-next-line no-await-in-loop -- батчи по 400 обязаны идти последовательно
    await batch.commit();
    created += chunk.length;
  }
  return { created };
}

/**
 * Генерирует уроки группы скользящим окном на 3 месяца вперёд от сегодня
 * (не от даты старта группы — иначе группа на год вперёд даёт тысячи лишних
 * документов). Идемпотентно, безопасно перезапускать при создании группы или
 * изменении расписания.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} group группа с JS-датами (startDate/endDate уже .toDate(), если из Firestore)
 * @param {string} group.id
 * @param {string} group.branchId
 * @param {string} group.code
 * @param {string} group.teacherId
 * @param {Date} group.startDate
 * @param {Date} group.endDate
 * @param {import('../types.js').GroupSchedule} group.schedule
 * @param {Object} [options]
 * @param {string[]} [options.holidays]
 * @param {number} [options.windowMonths]
 * @returns {Promise<{created: number}>}
 */
export async function generateLessons(db, group, { holidays = [], windowMonths = 3 } = {}) {
  const rangeEnd = minDate(group.endDate, addMonths(new Date(), windowMonths));
  const rangeStart = group.startDate;
  if (rangeStart > rangeEnd) return { created: 0 };
  const dates = scheduleDatesInRange(group.schedule, rangeStart, rangeEnd, holidays);
  return writeMissingLessons(db, group, dates);
}

/**
 * Точечная догенерация уроков ровно на один месяц — для ленивой подгрузки
 * в сетке посещаемости, когда открыт месяц вне скользящего 3-месячного окна
 * (например, прошлый год или далеко в будущем).
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} group группа с JS-датами
 * @param {string} monthStr "yyyy-MM"
 * @param {string[]} [holidays]
 * @returns {Promise<{created: number}>}
 */
export async function generateLessonsForMonth(db, group, monthStr, holidays = []) {
  const [year, month] = monthStr.split('-').map(Number);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const rangeStart = maxDate(group.startDate, monthStart);
  const rangeEnd = minDate(group.endDate, monthEnd);
  if (rangeStart > rangeEnd) return { created: 0 };

  const dates = scheduleDatesInRange(group.schedule, rangeStart, rangeEnd, holidays);
  return writeMissingLessons(db, group, dates);
}
