# Расписание кабинетов: кабинеты как цветные карточки со своим расписанием Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести уже выкаченный новый блок «Расписание кабинетов» (`RoomScheduleView` + `RoomScheduleBoard`) на вариант 4 из мокапа: каждый кабинет это пастельная карточка (как на фото-референсе), внутри неё по порядку занятия кабинета с местами; места зелёные (занято), жёлтые (записан на пробный), бургундские (больше, чем мест).

**Architecture:** Чистая логика в `src/lib/roomSchedule.js` (тесты `node:test`): места с пробными, статус кабинета «сейчас», загрузка, число пробных по группам, оттенок кабинета. Вид `RoomScheduleView` теряет таблицу и рисует сетку карточек кабинетов (по 3 в ряд). Два новых цветовых токена (`trial`, `burgundy`). `RoomScheduleBoard` добавляет одну подписку на лидов с назначенным пробным и передаёт во view `trialCounts`.

**Tech Stack:** React 19, Vite, Tailwind с токенами (`DESIGN.md`), Firestore, `node:test`.

**Визуальный эталон:** `/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/a3248690-aedb-4d45-959d-5d2b1fec6c95/scratchpad/rooms-v6.html`, вкладка «4» («Карточка кабинета со своим расписанием»). Файл открывается на `http://localhost:5190/rooms-v6.html` (сервер запущен). Мокап использует свои px и hex, в проекте заменять токенами и CSS-переменными. Отличия от мокапа, решённые владельцем: 3 кабинета в ряд, зелёные/жёлтые/бургундские места.

## Global Constraints

- Токены дизайна, а не px/hex (`DESIGN.md`): `text-caption|small|body|control|title|page|kpi`, `rounded-card|row|field|badge`. `npm run check:design` должен давать `ок`. Исключение: inline `style` с `color-mix(...)` для пастельных оттенков кабинета (hex в них не используется).
- Оттенок кабинета: `chart-K` (K = 1…7, `roomHueIndex(индекс кабинета в списке)`), в inline-стиле `--hue: rgb(var(--color-chart-K))`; пастель считается `color-mix(in srgb, var(--hue) N%, rgb(var(--color-surface)))`: фон 14%, рамка 38%, дорожка полосы 22%, заголовок `color-mix(in srgb, var(--hue) 60%, rgb(var(--color-text)))`. Так работает и в тёмной теме.
- Места: занято `bg-success`, записан на пробный `bg-trial` (новый токен, жёлтый), больше мест `bg-burgundy` (новый токен, бургундия), свободно `bg-surface` с `border-border-strong`. Форма места 13px с `style={{ borderRadius: 4 }}`.
- Число «N/M»: цвет по `fillTone` (`text-success`, `text-warning`, `text-burgundy` когда мест нет или перебор); при пробных рядом плашка «+K проб.» (`bg-trial/20`, тёмно-жёлтый текст `text-warning`).
- Кабинеты в сетке по 3 (`ROOMS_PER_ROW`; на узких экранах 2 и 1). Карточка кабинета: заголовок «Кабинет {name}» (`text-title`, жирный, цвет оттенка), меню «⋮» (переименовать, убрать кабинет), подзаголовок «N занятий · M мест», строка статуса сейчас, тонкая полоса загрузки внизу заголовка, затем занятия кабинета по возрастанию времени. Таблицы нет.
- Занятие внутри карточки кабинета: слева блок времени цвета оттенка кабинета (белый `text-title` жирный + «начало» `text-caption`), справа «КОД · курс» (код `text-navy` жирный), «N/M», ряд мест, имя учителя (нажатие подсвечивает занятия учителя), редактор вместимости по нажатию на «N/M» (как сейчас).
- Вместимость группы по умолчанию 12, диапазон 1…30 (уже в `roomSchedule.js`). Старый `RoomScheduleGrid.jsx` не трогать.
- Чтения Firestore: `groups` и `rooms` как сейчас плюс ОДНА подписка на лидов с назначенным пробным (`students`: `branchId ==`, `isArchived == false`, `funnelStage == 'trial_scheduled'`, индекс уже есть). Оба запроса в `useMemo`.
- Русский язык в UI и комментариях. Коммиты заканчиваются `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (дословно). Работа в worktree `room-schedule`, не пушить и не деплоить без команды владельца.

---

### Task 1: Логика карточек кабинетов (TDD)

**Files:**
- Modify: `src/lib/roomSchedule.js`
- Test: `scripts/room-schedule.test.mjs` (дополнить, существующие тесты не менять, кроме импорта)

**Interfaces (добавить к существующим экспортам, `seatStates` и `fillTone` получают необязательный третий аргумент, обратная совместимость сохраняется):**
- `LESSON_MINUTES = 90`
- `roomHueIndex(roomIndex) → number` 1…7
- `seatStates(students, capacity, trials = 0) → Array<'full'|'trial'|'free'|'over'>`
- `fillTone(students, capacity, trials = 0) → 'ok'|'mid'|'full'`
- `timeToMinutes('HH:MM') → number`, `minutesToTime(number) → 'HH:MM'`
- `meetsOnDate(group, date) → boolean`
- `roomStatus(groups, nowMinutes, meetsToday = () => true) → {kind: 'empty'|'none'|'live'|'next'|'done', group?, endsAt?}`
- `roomLoad(groups, trialCounts = {}) → {lessons: number, seats: number, used: number, pct: number}`
- `groupTrialCounts(groups, leads, today) → Record<groupId, number>`

- [ ] **Step 1: Написать падающие тесты.** В начало `scripts/room-schedule.test.mjs` добавить новые импорты в существующий `import { … } from '../src/lib/roomSchedule.js'`: `LESSON_MINUTES, roomHueIndex, timeToMinutes, minutesToTime, meetsOnDate, roomStatus, roomLoad, groupTrialCounts`. В конец файла добавить:

```js
test('оттенок кабинета 1…7 по кругу', () => {
  assert.equal(roomHueIndex(0), 1);
  assert.equal(roomHueIndex(6), 7);
  assert.equal(roomHueIndex(7), 1);
  assert.equal(roomHueIndex(15), 2);
});

test('места с пробными: ученик, пробный, свободно, больше мест', () => {
  assert.deepEqual(seatStates(2, 5, 1), ['full', 'full', 'trial', 'free', 'free']);
  assert.deepEqual(seatStates(3, 4, 1), ['full', 'full', 'full', 'trial']);
  assert.deepEqual(seatStates(3, 4, 3), ['full', 'full', 'full', 'trial', 'over', 'over']);
  assert.deepEqual(seatStates(5, 3, 1), ['full', 'full', 'full', 'over', 'over', 'over']);
  assert.deepEqual(seatStates(2, 3), ['full', 'full', 'free']);
});

test('цвет заполнения учитывает пробных', () => {
  assert.equal(fillTone(4, 8), 'ok');
  assert.equal(fillTone(4, 8, 2), 'mid');
  assert.equal(fillTone(6, 8, 2), 'full');
});

test('время в минуты и обратно', () => {
  assert.equal(LESSON_MINUTES, 90);
  assert.equal(timeToMinutes('17:20'), 1040);
  assert.equal(minutesToTime(1040), '17:20');
  assert.equal(minutesToTime(timeToMinutes('09:05') + 90), '10:35');
});

test('группа проходит в этот день: чётный, нечётный, по дням недели', () => {
  const even = { schedule: { type: 'even' } };
  const odd = { schedule: { type: 'odd' } };
  const wd = { schedule: { type: 'weekdays', weekdays: [1, 3] } };
  const d6 = new Date(2026, 9, 6); // вторник, 6 число
  const d7 = new Date(2026, 9, 7); // среда, 7 число
  assert.equal(meetsOnDate(even, d6), true);
  assert.equal(meetsOnDate(even, d7), false);
  assert.equal(meetsOnDate(odd, d7), true);
  assert.equal(meetsOnDate(wd, d7), true);
  assert.equal(meetsOnDate(wd, d6), false);
  assert.equal(meetsOnDate({ schedule: {} }, d6), false);
});

test('статус кабинета сейчас', () => {
  const g = (id, time) => ({ id, code: id, schedule: { time } });
  const gs = [g('a', '09:00'), g('b', '17:00'), g('c', '18:30')];
  assert.deepEqual(roomStatus([], 600), { kind: 'empty' });
  assert.deepEqual(roomStatus(gs, 600, () => false), { kind: 'none' });
  let s = roomStatus(gs, timeToMinutes('17:20'));
  assert.equal(s.kind, 'live');
  assert.equal(s.group.id, 'b');
  assert.equal(s.endsAt, '18:30');
  s = roomStatus(gs, timeToMinutes('12:00'));
  assert.equal(s.kind, 'next');
  assert.equal(s.group.id, 'b');
  s = roomStatus(gs, timeToMinutes('20:30'));
  assert.deepEqual(s, { kind: 'done' });
  s = roomStatus(gs, timeToMinutes('09:10'), (x) => x.id !== 'a');
  assert.equal(s.kind, 'next');
});

test('загрузка кабинета: занятия, места, занято, процент', () => {
  const gs = [
    { id: 'a', studentsCount: 6, capacity: 8 },
    { id: 'b', studentsCount: 3 }, // вместимость по умолчанию 12
  ];
  assert.deepEqual(roomLoad(gs, { a: 1 }), { lessons: 2, seats: 20, used: 10, pct: 50 });
  assert.deepEqual(roomLoad([], {}), { lessons: 0, seats: 0, used: 0, pct: 0 });
  assert.equal(roomLoad([{ id: 'x', studentsCount: 30, capacity: 5 }], {}).pct, 100);
});

test('пробные по группам: по курсу, времени, чётности, без прошедших', () => {
  const g = (id, courseId, time, type = 'even', extra = {}) => ({ id, courseId, schedule: { time, type, ...extra } });
  const dt = (d, h, m) => ({ toDate: () => new Date(2026, 9, d, h, m) });
  const lead = (courseId, date, stage = 'trial_scheduled') => ({ funnelStage: stage, trialCourseId: courseId, trialDate: date });
  const today = new Date(2026, 9, 6, 8, 0);
  const groups = [g('g1', 'c1', '17:00'), g('g2', 'c1', '17:00'), g('g3', 'c1', '18:30'), g('g4', 'c2', '17:00', 'odd')];
  const leads = [
    lead('c1', dt(6, 17, 0)),
    lead('c1', dt(8, 17, 0)),
    lead('c1', dt(10, 17, 0)),
    lead('c1', dt(7, 17, 0)), // нечётный день, чётные группы не подходят
    lead('c1', dt(1, 17, 0)), // прошлое
    lead('c1', dt(6, 18, 30), 'closing'), // не назначенный пробный
    lead('c2', dt(7, 17, 0)),
  ];
  assert.deepEqual(groupTrialCounts(groups, leads, today), { g1: 2, g2: 1, g3: 0, g4: 1 });
  assert.deepEqual(groupTrialCounts([], leads, today), {});
  assert.deepEqual(groupTrialCounts(groups, [], today), { g1: 0, g2: 0, g3: 0, g4: 0 });
});
```

- [ ] **Step 2: RED.** Run: `node --test scripts/room-schedule.test.mjs 2>&1 | tail -12`. Expected: FAIL (новые экспорты не найдены).

- [ ] **Step 3: Реализация.** В `src/lib/roomSchedule.js`: заменить `seatStates` и `fillTone`, добавить остальное (комментарии на русском):

```js
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
  const used = groups.reduce((s, g) => s + (g.studentsCount ?? 0) + (trialCounts[g.id] ?? 0), 0);
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
        && meetsOnDate(slotGroups[0], l.date),
    ).length;
    for (const g of slotGroups) {
      const take = Math.min(TRIALS_PER_GROUP, remaining);
      result[g.id] = take;
      remaining -= take;
    }
  }
  return result;
}
```

(старые определения `seatStates` и `fillTone` в файле заменить новыми, остальное не трогать; `groupCapacity` в том же модуле уже есть.)

- [ ] **Step 4: GREEN.** Run: `npm run test:lib 2>&1 | tail -8`. Expected: все тесты pass (8 + 2 из доработки + 9 новых), fail 0. Затем `npm run check:design | tail -2` → `ок`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roomSchedule.js scripts/room-schedule.test.mjs
git commit -m "feat(rooms): логика карточек кабинетов — пробные в местах, статус сейчас, загрузка, оттенок кабинета

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Токены, вид «карточки кабинетов», витрина

**Files:**
- Modify: `src/index.css` (токены `--color-trial`, `--color-burgundy` в `:root` и `.dark`), `tailwind.config.js` (цвета `trial`, `burgundy`), `DESIGN.md` (строка про цвета)
- Modify: `src/components/dashboard/RoomScheduleView.jsx` (перестроить на карточки кабинетов)
- Modify: `src/components/dev/RoomScheduleShowcase.jsx` (данные с пробными, новые колбэки)

**Токены:** `:root`: `--color-trial: 245 194 62;` `--color-burgundy: 140 29 64;` `.dark`: `--color-trial: 245 194 62;` `--color-burgundy: 214 90 128;`. В `tailwind.config.js` в `colors`: `trial: 'rgb(var(--color-trial) / <alpha-value>)'`, `burgundy: 'rgb(var(--color-burgundy) / <alpha-value>)'`.

**Interfaces (`RoomScheduleView`, дополнение к прежним пропсам):**
- новые необязательные: `trialCounts: Record<groupId, number>` (по умолчанию `{}`), `onRemoveRoom(roomId)`, `now: Date` (по умолчанию `new Date()`, для витрины и тестов).
- прежние пропсы и их семантика сохраняются (`onRemoveLastRoom` остаётся для кнопки «−» вверху).
- Потребляет: `seatStates`, `fillTone`, `roomHueIndex`, `roomStatus`, `roomLoad`, `meetsOnDate`, `timeToMinutes`, `LESSON_MINUTES`, `groupCapacity`, `clampCapacity`, `MIN_CAPACITY`, `MAX_CAPACITY`, `teacherStats`, `teacherColorIndex` (уже есть после доработки).

**Поведение (сверять с мокапом, вкладка «4»):**
1. Верх как сейчас: чипы типов дней, «Кабинетов [−] N [+]», легенда (4 образца: занято, записан на пробный, свободно, больше, чем мест, плюс «6/8 = 6 учеников из 8 мест»), полоса учителей и сводка выбранного учителя (в сводке у «каб. N» маленький квадрат оттенка кабинета).
2. Вместо таблицы сетка карточек кабинетов (3 в ряд, `sm`: 2, мобильный: 1) и в конце плитка «Добавить кабинет» (пунктирная, вызывает `onAddRoom`).
3. Карточка кабинета: пастельный фон по оттенку, заголовок «Кабинет {name}», меню «⋮» (кнопка с `aria-label`, `aria-haspopup`, закрывается по клику снаружи и Escape; пункты «Переименовать» и «Убрать кабинет» (последний вызывает `onRemoveRoom(room.id)`, красноватый)), подзаголовок «N занятий · M мест» (`roomLoad`), строка статуса (`roomStatus` по группам кабинета с `meetsToday = g => meetsOnDate(g, now)`; тексты: live «Идёт: КОД · N/M · до HH:MM», next «Свободен до HH:MM», done «Сегодня занятий больше нет», none «Сегодня занятий нет», empty «Групп нет»; точка статуса оттенка кабинета), полоса загрузки внизу заголовка (ширина `pct`). Под заголовком занятия кабинета по возрастанию времени (разделение 8px).
4. Переименование: «Переименовать» или нажатие на заголовок превращает заголовок в поле (Enter сохраняет через `onRenameRoom`, Escape отменяет, пустое имя и без изменений не сохраняются, `maxLength` 24, фокус возвращается на кнопку «⋮» после закрытия).
5. Занятие: как в «Глобальных ограничениях». Число пробных группы берётся из `trialCounts[g.id] ?? 0`; места рисуются `seatStates(g.studentsCount, capacity, trials)`; «N/M» и плашка «+K проб.» как описано; нажатие на «N/M» раскрывает редактор вместимости (`onChangeCapacity(groupId, value)`); недоступно при `canEdit === false`.
6. Подсветка учителя: занятия других учителей `opacity-30`; карточки кабинетов без занятий выбранного учителя не скрываются.
7. Сохраняются из доработки: фокус-менеджмент, `canEdit`, `loading` (скелетон/блокировки), стабильные цвета учителей, `notice`.
8. Пустые состояния: нет кабинетов («Кабинеты не заведены»), в кабинете нет групп этого типа дней («Занятий нет»).
9. Тёмная тема: только токены, пастель через `color-mix` от `--color-surface`.

**Витрина:** состояние локальное, 4 кабинета, 12+ групп с примерами пробных (`trialCounts`), одна группа с перебором, «сейчас» фиксируется через проп `now` = `new Date(2026, 9, 6, 17, 20)` (чётный вторник 6 октября 2026), чтобы статус «Идёт: …» был виден. Колбэки меняют локальный state.

- [ ] **Step 1:** Токены, `DESIGN.md`. Проверка: `npm run build 2>&1 | tail -3`.
- [ ] **Step 2:** Перестроить `RoomScheduleView.jsx` (удалить таблицу и её `th/td`-код), обновить витрину.
- [ ] **Step 3: Проверка**

Run: `npm run check:design | tail -2 && npm run test:lib 2>&1 | tail -6 && npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: `ок`, тесты pass, lint без новых замечаний, `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/index.css tailwind.config.js DESIGN.md src/components/dashboard/RoomScheduleView.jsx src/components/dev/RoomScheduleShowcase.jsx
git commit -m "feat(rooms): кабинеты как цветные карточки со своим расписанием, места зелёные/жёлтые/бургундские

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Пробные и удаление кабинета в RoomScheduleBoard

**Files:**
- Modify: `src/components/dashboard/RoomScheduleBoard.jsx`

**Interfaces:**
- Consumes: `groupTrialCounts` (Task 1), `RoomScheduleView` новые пропсы `trialCounts`, `onRemoveRoom` (Task 2).
- Produces: прежний `RoomScheduleBoard({ branchId })`.

**Требования:**
- Новая подписка `useCollection` на лидов с назначенным пробным: `query(collection(db, 'students'), where('branchId', '==', branchId), where('isArchived', '==', false), where('funnelStage', '==', 'trial_scheduled'))`, строго в `useMemo([branchId])` (необходимо: незамемоизированный запрос однажды сжёг квоту чтений). Комментарий над запросом: «лиды с назначенным пробным: считаются жёлтыми местами; десятки документов».
- `trialCounts = useMemo(() => groupTrialCounts(viewGroups, trialLeads, new Date()), [viewGroups, trialLeads])` (пересчитывается при смене групп/лидов; `new Date()` создавать внутри, не в зависимостях).
- `onRemoveRoom(roomId)`: тот же поток, что сейчас у «убрать последний» (проверка активных групп через `getDocs`, `notice`, `ConfirmDialog`, архивация), но для указанного кабинета; «убрать последний кабинет» вызывает его с последним кабинетом. Общий код не дублировать.
- Подписку на лидов не создавать, пока нет `branchId`/`db` (как у остальных запросов).
- Старый `RoomScheduleGrid.jsx` не трогать; `git diff --stat main..HEAD -- src/components/dashboard/RoomScheduleGrid.jsx` пусто.

- [ ] **Step 1:** Реализовать.
- [ ] **Step 2: Проверка**

Run: `npm run check:design | tail -2 && npm run test:lib 2>&1 | tail -6 && npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: `ок`, pass, без новых замечаний, `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/RoomScheduleBoard.jsx
git commit -m "feat(rooms): Board читает лидов с пробным для жёлтых мест, удаление выбранного кабинета через меню

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

- Вариант 4 (карточка кабинета со своим расписанием), пастель как на фото: Task 2 п.3, Global Constraints (оттенки через `chart-K` и `color-mix`).
- Зелёные места, жёлтые для пробных, бургундские при превышении: токены `trial`, `burgundy`, `seatStates` (Task 1), п.5 Task 2.
- Пробные из лидов: `groupTrialCounts` (Task 1) + подписка (Task 3).
- Меню кабинета (переименовать, убрать), статус сейчас, полоса загрузки: Task 2 п.3–4, `roomStatus`, `roomLoad`.
- 3 кабинета в ряд: сетка 3 колонок.
- Старый блок и `RoomScheduleGrid` не меняются.
- Типы: `seatStates(students, capacity, trials)`, `fillTone(...)`, `roomStatus` → `{kind, group, endsAt}`, `roomLoad`, `groupTrialCounts` названы одинаково во всех задачах.
