// src/lib/greeting.js

// Приветствия страницы «Задачи» — по мотивам приветствий Claude, по времени
// суток. `{name}` — имя сотрудника; фразы с ним выкидываются, если имени нет.
// `days` — getDay() (0 — вс … 6 — сб): фраза только в эти дни недели.
const WEEKEND = [0, 6];

const GREETINGS = {
  morning: [
    { text: 'Доброе утро, {name}' },
    { text: 'Доброе утро' },
    { text: 'Добро пожаловать, {name}' },
    { text: 'Привет, {name}' },
    { text: 'Время кофе и задач?' },
    { text: 'О чём думаете, {name}?', days: WEEKEND },
    { text: 'Хорошего понедельника, {name}', days: [1] },
    { text: 'Хорошего вторника, {name}', days: [2] },
    { text: 'Хорошей среды, {name}', days: [3] },
    { text: 'Хорошего четверга, {name}', days: [4] },
    { text: 'С пятницей, {name}', days: [5] },
    { text: 'Пятничное настроение, {name}', days: [5] },
    { text: 'Добро пожаловать в выходные, {name}', days: WEEKEND },
    { text: 'Хорошей субботы, {name}', days: [6] },
    { text: 'Хорошего воскресенья, {name}', days: [0] },
    { text: 'Воскресная сессия, {name}?', days: [0] },
  ],
  afternoon: [
    { text: 'Добрый день, {name}' },
    { text: 'Добрый день' },
    { text: 'Привет, {name}, как дела?' },
    { text: 'Что нового, {name}?' },
    { text: 'Снова в деле, {name}' },
    { text: 'Снова в деле!' },
  ],
  evening: [
    { text: 'Добрый вечер, {name}' },
    { text: 'Добрый вечер' },
    { text: 'Вечер добрый, {name}' },
    { text: 'Вечер добрый' },
    { text: '{name} возвращается!' },
    { text: 'Как прошёл день, {name}?' },
  ],
  night: [
    { text: 'Как дела, {name}?' },
    { text: 'О чём думаете этой ночью?' },
    { text: 'Привет, сова' },
  ],
};

/** Часть суток: утро 6–12, день 12–17, вечер 17–21, ночь 21–6. */
export function dayPart(date = new Date()) {
  const h = date.getHours();
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

/**
 * Случайное приветствие, подходящее к времени суток и дню недели.
 * @param {string} [fullName] полное имя — берётся первое слово
 * @param {Date} [date]
 * @param {() => number} [random]
 * @returns {string}
 */
export function pickGreeting(fullName, date = new Date(), random = Math.random) {
  const name = (fullName ?? '').trim().split(/\s+/)[0];
  const pool = GREETINGS[dayPart(date)].filter(
    (g) => (!g.days || g.days.includes(date.getDay())) && (name || !g.text.includes('{name}')),
  );
  return pool[Math.floor(random() * pool.length)].text.replace('{name}', name);
}
