// Чистая логика блока «Расписание кабинетов» (дашборд): вместимость групп, места «как в
// кинотеатре», блоки по 2 кабинета, статистика учителей. Без React и Firestore.

export const DEFAULT_GROUP_CAPACITY = 12;
export const MIN_CAPACITY = 1;
export const MAX_CAPACITY = 30;

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

/** Кабинеты блоками по `size` (по 2 в ряд, лишние блоком ниже). */
export function chunkRooms(rooms, size = 2) {
  const out = [];
  for (let i = 0; i < rooms.length; i += size) out.push(rooms.slice(i, i + size));
  return out;
}

/**
 * Места как в кинотеатре: 'full' — ученик, 'free' — свободное место,
 * 'over' — ученик сверх вместимости.
 */
export function seatStates(students, capacity) {
  const total = Math.max(students, capacity);
  return Array.from({ length: total }, (_, i) => (i >= capacity ? 'over' : i < students ? 'full' : 'free'));
}

/** 'full' — мест нет или перебор, 'mid' — от 75%, иначе 'ok'. */
export function fillTone(students, capacity) {
  if (students >= capacity) return 'full';
  return students / capacity >= 0.75 ? 'mid' : 'ok';
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
