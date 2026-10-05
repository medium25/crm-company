// Чистая логика блока «Расписание кабинетов» (дашборд): вместимость групп, места «как в
// кинотеатре», блоки по 3 кабинета, статистика учителей. Без React и Firestore.

export const DEFAULT_GROUP_CAPACITY = 12;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 30;
export const ROOMS_PER_ROW = 3;

/** @param {number} n */
export function clampCapacity(n) {
  return Math.max(MIN_CAPACITY, Math.min(MAX_CAPACITY, Math.round(n)));
}

/** Вместимость группы: поле capacity, иначе 12. Мусор и 0 дают 12, выше 30 — 30. */
export function groupCapacity(group) {
  const c = Number(group?.capacity);
  if (!Number.isFinite(c) || c < MIN_CAPACITY) return DEFAULT_GROUP_CAPACITY;
  return clampCapacity(c);
}

/** Кабинеты блоками по `size` (по 3 в ряд, лишние блоком ниже). */
export function chunkRooms(rooms, size = ROOMS_PER_ROW) {
  const out = [];
  for (let i = 0; i < rooms.length; i += size) out.push(rooms.slice(i, i + size));
  return out;
}

export const LESSON_MINUTES = 90;
const HUE_COUNT = 7;
/** Пробных на группу показываем не больше стольких же, сколько лотов на группу в groupCapacity.js (SLOTS_PER_GROUP = 2). */
const TRIALS_PER_GROUP = 2;

/** Номер оттенка chart-K (1…7) для кабинета по его порядковому номеру в списке. */
export function roomHueIndex(roomIndex) {
  return (roomIndex % HUE_COUNT) + 1;
}

/**
 * Места как в кинотеатре: 'full' — ученик, 'trial' — записан на пробный на это время,
 * 'free' — свободное место, 'over' — занято сверх вместимости.
 */
export function seatStates(students, capacity, trials = 0) {
  const used = students + trials;
  const total = Math.max(capacity, used);
  return Array.from({ length: total }, (_, i) =>
    i >= capacity ? 'over' : i < students ? 'full' : i < used ? 'trial' : 'free');
}

/** 'full' — мест нет или перебор, 'mid' — от 75%, иначе 'ok'. Пробные занимают места. */
export function fillTone(students, capacity, trials = 0) {
  const used = students + trials;
  if (used >= capacity) return 'full';
  return used / capacity >= 0.75 ? 'mid' : 'ok';
}

export function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Проходит ли группа в этот день (чётное/нечётное число месяца или день недели). */
export function meetsOnDate(group, date) {
  const type = group.schedule?.type;
  if (type === 'even') return date.getDate() % 2 === 0;
  if (type === 'odd') return date.getDate() % 2 === 1;
  if (type === 'weekdays') return (group.schedule.weekdays ?? []).includes(date.getDay());
  return false;
}

/**
 * Статус кабинета сейчас по его группам: 'empty' — групп нет, 'none' — сегодня занятий нет,
 * 'live' — идёт занятие (group, endsAt), 'next' — ближайшее сегодня (group), 'done' — все прошли.
 * @param {Array<Object>} groups группы одного кабинета
 * @param {number} nowMinutes минуты от полуночи
 * @param {(group: Object) => boolean} [meetsToday] проходит ли группа сегодня
 */
export function roomStatus(groups, nowMinutes, meetsToday = () => true) {
  if (groups.length === 0) return { kind: 'empty' };
  const today = groups
    .filter(meetsToday)
    .filter((g) => g.schedule?.time)
    .sort((a, b) => timeToMinutes(a.schedule.time) - timeToMinutes(b.schedule.time));
  if (today.length === 0) return { kind: 'none' };
  const live = today.find((g) => {
    const start = timeToMinutes(g.schedule.time);
    return nowMinutes >= start && nowMinutes < start + LESSON_MINUTES;
  });
  if (live) return { kind: 'live', group: live, endsAt: minutesToTime(timeToMinutes(live.schedule.time) + LESSON_MINUTES) };
  const next = today.find((g) => timeToMinutes(g.schedule.time) > nowMinutes);
  return next ? { kind: 'next', group: next } : { kind: 'done' };
}

/** Загрузка кабинета по группам: число занятий, места, занято (ученики и пробные), процент. */
export function roomLoad(groups, trialCounts = {}) {
  const seats = groups.reduce((s, g) => s + groupCapacity(g), 0);
  const students = (g) => {
    const n = Number(g.studentsCount);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const used = groups.reduce((s, g) => s + students(g) + (trialCounts[g.id] ?? 0), 0);
  return { lessons: groups.length, seats, used, pct: seats ? Math.min(100, Math.round((used / seats) * 100)) : 0 };
}

/**
 * Сколько записанных на пробный приходится на каждую группу. Бронь общая на «курс + время + день»,
 * поэтому, как в groupCapacity.distributeOccupancy, раскладываем по порядку по 2 на группу (только для показа).
 * Считаются лиды в стадии trial_scheduled с пробным сегодня или позже.
 * @param {Array<Object>} groups
 * @param {Array<Object>} leads
 * @param {Date} today
 * @returns {Record<string, number>}
 */
export function groupTrialCounts(groups, leads, today) {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const booked = leads
    .filter((l) => l.funnelStage === 'trial_scheduled')
    .map((l) => ({ courseId: l.trialCourseId, date: l.trialDate?.toDate?.() }))
    .filter((l) => l.courseId && l.date && l.date >= startOfToday);

  const result = {};
  const slots = new Map();
  for (const g of groups) {
    result[g.id] = 0;
    const key = `${g.courseId}|${g.schedule?.time}|${g.schedule?.type}`;
    slots.set(key, [...(slots.get(key) ?? []), g]);
  }
  for (const slotGroups of slots.values()) {
    const { courseId, schedule } = slotGroups[0];
    if (!schedule?.time) continue;
    let remaining = booked.filter(
      (l) => l.courseId === courseId
        && minutesToTime(l.date.getHours() * 60 + l.date.getMinutes()) === schedule.time
        && slotGroups.some((sg) => meetsOnDate(sg, l.date)),
    ).length;
    for (const g of slotGroups) {
      const take = Math.min(TRIALS_PER_GROUP, remaining);
      result[g.id] = take;
      remaining -= take;
    }
  }
  return result;
}

/** Времена начала групп этих кабинетов: уникальные, по возрастанию ("09:00" < "17:00"). */
export function blockTimes(groups, roomIds) {
  const times = groups
    .filter((g) => roomIds.includes(g.roomId))
    .map((g) => g.schedule?.time)
    .filter(Boolean);
  return [...new Set(times)].sort();
}

/** Учителя с числом учеников и их группами по времени. Учителя по имени. */
export function teacherStats(groups) {
  const map = new Map();
  for (const g of groups) {
    const key = g.teacherId ?? g.teacherName ?? '';
    const cur = map.get(key) ?? { key, name: g.teacherName ?? '', students: 0, groups: [] };
    cur.students += g.studentsCount ?? 0;
    cur.groups.push(g);
    map.set(key, cur);
  }
  const list = [...map.values()];
  for (const t of list) t.groups.sort((a, b) => (a.schedule?.time ?? '').localeCompare(b.schedule?.time ?? ''));
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

/** Следующее название нового кабинета: максимальное число в названиях плюс один. */
export function nextRoomName(rooms) {
  const nums = rooms.map((r) => parseInt(r.name, 10)).filter(Number.isFinite);
  return String(nums.length ? Math.max(...nums) + 1 : rooms.length + 1);
}

/**
 * Стабильный номер цвета учителя 1…7 (цвета графиков) по ключу teacherId ?? teacherName.
 * Не зависит от списка на экране, поэтому цвет не меняется между «Чётные»/«Нечётные».
 * Два учителя могут совпасть по цвету.
 */
export function teacherColorIndex(key) {
  const s = String(key ?? '');
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 7) + 1;
}
