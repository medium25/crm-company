// src/lib/groupCode.js

/**
 * Код группы по правилу: [язык][чётность][имя учителя][час начала].
 *  1) язык: R — русский, I — английский;
 *  2) T — нечётные дни (toq), J — чётные (juft);
 *  3) первая буква имени учителя (без «MS»/«MR»); имя на «Sh» или «Ch» — обе буквы;
 *  4) час начала урока целым числом: 09:00 → 9, 10:30 → 10, 18:30 → 18.
 * Например: русский, нечётные, MS SHAXZODA, 14:00 → «RTSh14».
 */
const TITLES = new Set(['MS', 'MR', 'MRS', 'MISS', 'MISTER']);

/** @param {string} [courseName] @returns {'R'|'I'|null} */
export function languageLetter(courseName) {
  const name = (courseName ?? '').toUpperCase();
  if (/RUS|РУС/.test(name)) return 'R';
  if (/INGLIZ|ENG|АНГЛ/.test(name)) return 'I';
  return null;
}

/** @param {string} [scheduleType] 'odd' | 'even' | 'weekdays' @returns {'T'|'J'|null} */
export function parityLetter(scheduleType) {
  if (scheduleType === 'odd') return 'T';
  if (scheduleType === 'even') return 'J';
  return null;
}

/** «MS SHAXZODA» → «Sh», «MS KRISTINA» → «K». @param {string} [teacherName] @returns {string|null} */
export function teacherInitial(teacherName) {
  const words = (teacherName ?? '').trim().split(/\s+/).filter(Boolean);
  const nameWord = words.find((w) => !TITLES.has(w.toUpperCase().replace(/\./g, '')));
  if (!nameWord) return null;
  const up = nameWord.toUpperCase();
  if (up.startsWith('SH')) return 'Sh';
  if (up.startsWith('CH')) return 'Ch';
  return up[0];
}

/** «18:30» → 18. @param {string} [time] @returns {number|null} */
export function startHour(time) {
  const h = Number.parseInt((time ?? '').split(':')[0], 10);
  return Number.isFinite(h) ? h : null;
}

/**
 * @param {{courseName?: string, scheduleType?: string, teacherName?: string, time?: string}} group
 * @returns {string|null} null — по этим данным код не собрать (неизвестный язык, «по дням недели» и т.п.)
 */
export function groupCodeFor({ courseName, scheduleType, teacherName, time }) {
  const lang = languageLetter(courseName);
  const parity = parityLetter(scheduleType);
  const teacher = teacherInitial(teacherName);
  const hour = startHour(time);
  if (!lang || !parity || !teacher || hour === null) return null;
  return `${lang}${parity}${teacher}${hour}`;
}
