# Расписание кабинетов: новая сетка (2 столбца, места как в кинотеатре) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переделать блок «Расписание кабинетов» на дашборде: 3 кабинета в ряд (лишние блоком ниже), время занятия крупным синим блоком внутри карточки, под названием места занятые и свободные, вместимость группы настраивается, кабинеты переименовываются, добавляются и убираются, у учителей видно число учеников и их занятия (время и кабинет).

**Architecture:** Чистая логика в `src/lib/roomSchedule.js` (тесты `node:test`). Презентационный `RoomScheduleView` получает данные и колбэки через пропсы и не знает про Firestore, что даёт возможность смотреть его на витрине `#/settings/ui` без входа. Контейнер `RoomScheduleGrid` (уже существует) подписывается на `groups` и `rooms` и пишет в Firestore: `groups.{id}.capacity`, `rooms.{id}.name`, создание и архивация кабинетов.

**Tech Stack:** React 19, Vite, Tailwind с токенами (см. `DESIGN.md`), Firestore, `node:test`.

**Визуальный эталон (в мокапе 2 столбца, в проекте 3):** `/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/a3248690-aedb-4d45-959d-5d2b1fec6c95/scratchpad/rooms-v4.html`, вариант «2» (кнопка 2 вверху страницы): блок времени внутри карточки. Полоса учителей над таблицей, легенда, «6/8» с карандашом, редактор вместимости, переименование кабинета с карандашом в заголовке. Файл открывается на `http://localhost:5190/rooms-v4.html`, сервер уже запущен (`python3 -m http.server 5190` в каталоге scratchpad). Перенос в проект: размеры и цвета заменяются токенами из `DESIGN.md` (мокап использует свои px).

## Global Constraints

- Токены дизайна, а не px/hex: текст `text-caption|small|body|control|title|page|kpi`, радиусы `rounded-card|row|field|badge`, цвета палитры (`bg-navy`, `text-muted`, `bg-surface`, `border-border`, `chart-1..7`, `warning`, `danger`, `success`). Скрипт `npm run check:design` должен давать `ок` (папка `src/components/dashboard/` не в списке LEGACY).
- Квадрат-место: форма 4px через inline `style={{ borderRadius: 4 }}`, не `rounded-[4px]`.
- Кабинеты в 3 столбца (решение владельца, мокап рисует 2: считать константой `ROOMS_PER_ROW = 3`). Четвёртый и далее идут отдельными блоками таблицы ниже, у каждого блока свои строки времени.
- Вместимость группы по умолчанию 12 мест (решение владельца), хранится в `groups.{id}.capacity`, диапазон 1…30.
- Колонки: время внутри карточки (синий блок слева: `bg-navy`, белый текст `text-title`, подпись «начало» `text-caption`), отдельной колонки времени нет.
- Занято/свободно: закрашенный квадрат это ученик (`studentsCount`), пустой это свободное место, красный (`bg-danger`) это учеников больше, чем мест. Число «6/8» цветом: зелёный `text-success` до 74%, оранжевый `text-warning` от 75%, красный `text-danger` когда мест нет.
- Не менять данные и логику вне блока расписания. Новых чтений Firestore не добавлять (сохранить текущие два запроса `groups` и `rooms`).
- Русский язык в UI и комментариях. Коммиты заканчиваются `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (копировать дословно).
- Работа в worktree `.claude/worktrees/room-schedule` на ветке `room-schedule` от main. Не пушить и не деплоить без отдельной команды владельца.

---

### Task 1: Логика расписания (TDD)

**Files:**
- Create: `src/lib/roomSchedule.js`
- Test: `scripts/room-schedule.test.mjs`
- Modify: `package.json` (скрипт `test:lib`)

**Interfaces:**
- Produces (все чистые функции, ES-модуль):
  - `DEFAULT_GROUP_CAPACITY = 12`, `MIN_CAPACITY = 1`, `MAX_CAPACITY = 30`
  - `groupCapacity(group) → number` (поле `capacity`, иначе 12; значения вне 1…30 приводятся к границам)
  - `clampCapacity(n) → number`
  - `ROOMS_PER_ROW = 3`
  - `chunkRooms(rooms, size = ROOMS_PER_ROW) → Array<Array<room>>`
  - `seatStates(students, capacity) → Array<'full'|'free'|'over'>`
  - `fillTone(students, capacity) → 'ok'|'mid'|'full'`
  - `blockTimes(groups, roomIds) → string[]` (уникальные `schedule.time` групп этих кабинетов, по возрастанию)
  - `teacherStats(groups) → Array<{key: string, name: string, students: number, groups: Array<group>}>` (группы учителя по времени, учителя по имени)
  - `nextRoomName(rooms) → string`

- [ ] **Step 1: Написать падающие тесты** `scripts/room-schedule.test.mjs`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GROUP_CAPACITY, ROOMS_PER_ROW, groupCapacity, clampCapacity, chunkRooms, seatStates, fillTone,
  blockTimes, teacherStats, nextRoomName,
} from '../src/lib/roomSchedule.js';

test('вместимость по умолчанию 12', () => {
  assert.equal(DEFAULT_GROUP_CAPACITY, 12);
  assert.equal(groupCapacity({}), 12);
  assert.equal(groupCapacity({ capacity: undefined }), 12);
  assert.equal(groupCapacity({ capacity: 'x' }), 12);
});

test('вместимость группы из поля и границы 1…30', () => {
  assert.equal(groupCapacity({ capacity: 8 }), 8);
  assert.equal(groupCapacity({ capacity: 0 }), 12);
  assert.equal(groupCapacity({ capacity: 99 }), 30);
  assert.equal(clampCapacity(0), 1);
  assert.equal(clampCapacity(31), 30);
  assert.equal(clampCapacity(7.6), 8);
});

test('кабинеты по 3 в блоке', () => {
  assert.equal(ROOMS_PER_ROW, 3);
  const r = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id }));
  assert.deepEqual(chunkRooms(r).map((b) => b.map((x) => x.id)), [[1, 2, 3], [4, 5, 6], [7]]);
  assert.deepEqual(chunkRooms(r, 2).map((b) => b.map((x) => x.id)), [[1, 2], [3, 4], [5, 6], [7]]);
  assert.deepEqual(chunkRooms([]), []);
});

test('места: занято, свободно, больше мест', () => {
  assert.deepEqual(seatStates(2, 4), ['full', 'full', 'free', 'free']);
  assert.deepEqual(seatStates(3, 3), ['full', 'full', 'full']);
  assert.deepEqual(seatStates(5, 3), ['full', 'full', 'full', 'over', 'over']);
  assert.deepEqual(seatStates(0, 2), ['free', 'free']);
});

test('цвет заполнения', () => {
  assert.equal(fillTone(3, 8), 'ok');
  assert.equal(fillTone(5, 8), 'ok');
  assert.equal(fillTone(6, 8), 'mid');
  assert.equal(fillTone(7, 8), 'mid');
  assert.equal(fillTone(8, 8), 'full');
  assert.equal(fillTone(9, 8), 'full');
});

test('времена блока: уникальные и по возрастанию, только свои кабинеты', () => {
  const g = [
    { roomId: 'a', schedule: { time: '17:00' } },
    { roomId: 'a', schedule: { time: '09:00' } },
    { roomId: 'b', schedule: { time: '17:00' } },
    { roomId: 'c', schedule: { time: '12:00' } },
    { roomId: 'a', schedule: {} },
  ];
  assert.deepEqual(blockTimes(g, ['a', 'b']), ['09:00', '17:00']);
  assert.deepEqual(blockTimes(g, ['zzz']), []);
});

test('учителя: ученики и группы по времени', () => {
  const g = [
    { id: '1', teacherId: 't2', teacherName: 'B', studentsCount: 3, schedule: { time: '18:00' } },
    { id: '2', teacherId: 't1', teacherName: 'A', studentsCount: 5, schedule: { time: '17:00' } },
    { id: '3', teacherId: 't2', teacherName: 'B', studentsCount: 4, schedule: { time: '09:00' } },
    { id: '4', teacherId: 't1', teacherName: 'A', schedule: { time: '12:00' } },
  ];
  const s = teacherStats(g);
  assert.deepEqual(s.map((x) => [x.name, x.students]), [['A', 5], ['B', 7]]);
  assert.deepEqual(s[0].groups.map((x) => x.id), ['4', '2']);
  assert.deepEqual(s[1].groups.map((x) => x.id), ['3', '1']);
});

test('название нового кабинета: следующее число', () => {
  assert.equal(nextRoomName([{ name: '4' }, { name: '10' }, { name: 'Большой' }]), '11');
  assert.equal(nextRoomName([{ name: 'А' }, { name: 'Б' }]), '3');
  assert.equal(nextRoomName([]), '1');
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `node --test scripts/room-schedule.test.mjs 2>&1 | tail -6`
Expected: FAIL (`Cannot find module '../src/lib/roomSchedule.js'`).

- [ ] **Step 3: Реализация** `src/lib/roomSchedule.js`

```js
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

/** Сколько кабинетов в одном ряду таблицы (решение владельца). */
export const ROOMS_PER_ROW = 3;

/** Кабинеты блоками по `size` (по 3 в ряд, лишние блоком ниже). */
export function chunkRooms(rooms, size = ROOMS_PER_ROW) {
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
```

- [ ] **Step 4: Скрипт и прогон** — в `package.json` в `"scripts"` добавить после `test:design`:

```json
    "test:lib": "node --test scripts/room-schedule.test.mjs",
```

Run: `npm run test:lib 2>&1 | tail -6`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/roomSchedule.js scripts/room-schedule.test.mjs package.json
git commit -m "feat(rooms): логика расписания кабинетов — места, блоки по 2, учителя, вместимость 12 по умолчанию

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Презентационный компонент RoomScheduleView и витрина

**Files:**
- Create: `src/components/dashboard/RoomScheduleView.jsx`
- Create: `src/components/dev/RoomScheduleShowcase.jsx`
- Modify: `src/pages/UiKitShowcasePage.jsx` (строка в списке секций: `['Расписание кабинетов', RoomScheduleShowcase]` и импорт)

**Interfaces:**
- Consumes (Task 1): `groupCapacity`, `clampCapacity`, `MIN_CAPACITY`, `MAX_CAPACITY`, `chunkRooms`, `seatStates`, `fillTone`, `blockTimes`, `teacherStats`.
- Produces `RoomScheduleView(props)`:
  - `rooms: Array<{id: string, name: string}>` — уже по порядку
  - `groups: Array<{id, code, courseName, teacherId, teacherName, studentsCount, capacity?, roomId, schedule: {time: string}}>` — уже отфильтрованы по типу дней
  - `dayType: 'even'|'odd'|'weekdays'`, `onDayTypeChange(value)`
  - `onRenameRoom(roomId, name)`, `onChangeCapacity(groupId, capacity)`, `onAddRoom()`, `onRemoveLastRoom()`
  - `onOpenGroup(groupId)` (нажатие на код группы, переход)
  - `notice?: string` (предупреждение, напр. «В кабинете есть группы»)
  - `loading?: boolean`, `canEdit?: boolean` (по умолчанию true; без прав скрыть карандаши и кнопки)
- Состояние только UI: какой кабинет переименовывается, какая группа правит вместимость, выбранный учитель (подсветка).

**Поведение (сверять с мокапом):**
1. Верх: чипы «Чётные дни / Нечётные дни / По дням недели» (`FilterChip`), справа «Кабинетов [−] N [+]» (кнопки `size="sm"` иконки `Minus`/`Plus` из lucide-react, по 36px).
2. Легенда одной строкой: закрашенный квадрат «занято (ученик)», пустой «свободно», красный «больше, чем мест», текст «6/8 = 6 учеников из 8 мест».
3. Полоса учителей (чипы с цветной точкой, именем и «N уч.»), нажатие подсвечивает занятия учителя, остальные карточки `opacity-30`; над таблицей сводка выбранного учителя: «N учеников сейчас в M группах. Занятия: [17:00 каб. 4] …» с крестиком. Цвет учителя: `rgb(var(--color-chart-K))`, K по индексу учителя в `teacherStats` (по кругу 1…7).
4. Таблица блоками по 3 кабинета (`chunkRooms`, константа `ROOMS_PER_ROW`), у блока свои строки времени (`blockTimes`). Заголовок столбца «Кабинет {name}» с карандашом; нажатие превращает в поле ввода (Enter сохраняет через `onRenameRoom`, Escape отменяет, пустое имя не сохраняется, `maxLength` 24).
5. Карточка группы: слева синий блок времени (`bg-navy`, белое `text-title` жирное, «начало» `text-caption`), справа две строки: «КОД · курс» (код `text-navy` жирный, нажатие `onOpenGroup`) и «N/M» с карандашом; ниже квадраты-места (`seatStates`, 13px, отступ 3px) и имя учителя (нажатие выбирает учителя). Нажатие на «N/M» раскрывает под карточкой «Вместимость группы [−] M [+] Готово» (`clampCapacity`, вызов `onChangeCapacity(groupId, newValue)` при каждом нажатии).
6. Пустые состояния: нет кабинетов («Кабинеты не заведены»), нет групп этого типа дней («Нет групп с таким типом расписания»), в блоке нет групп («В этих кабинетах пока нет групп»).
7. Состояния доступности: `aria-label` на иконочных кнопках, фокус-кольцо у кнопок, `title` на «N/M».

**Витрина:** `RoomScheduleShowcase` держит локальное состояние и данные примера (как в мокапе: 4 кабинета, 12 групп, 4 учителя) и показывает `RoomScheduleView` внутри `Card`. Колбэки меняют локальный state (переименование, вместимость, добавление/убирание кабинета с предупреждением если в последнем есть группы).

- [ ] **Step 1:** Прочитать мокап `rooms-v4.html` (JS внизу и CSS) и `DESIGN.md`. Построить `RoomScheduleView.jsx` по поведению выше. Все стили токенами; квадраты-места inline `style={{ borderRadius: 4 }}`; цвет учителя inline `style={{ '--tc': 'rgb(var(--color-chart-K))' }}`.
- [ ] **Step 2:** Построить `RoomScheduleShowcase.jsx` и подключить в `UiKitShowcasePage.jsx`.
- [ ] **Step 3: Проверка**

Run: `npm run check:design | tail -2 && npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: `check-design: ок`, lint без новых замечаний, `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/RoomScheduleView.jsx src/components/dev/RoomScheduleShowcase.jsx src/pages/UiKitShowcasePage.jsx
git commit -m "feat(rooms): RoomScheduleView — 2 кабинета в ряд, время в карточке, места как в кинотеатре, учителя; витрина

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Контейнер RoomScheduleGrid с записью в Firestore

**Files:**
- Modify: `src/components/dashboard/RoomScheduleGrid.jsx` (полная замена содержимого)

**Interfaces:**
- Consumes: `RoomScheduleView` (Task 2), `DEFAULT_GROUP_CAPACITY`, `clampCapacity`, `nextRoomName` (Task 1), `useAuth` (user.uid, как в `RoomsPage.jsx`), `useToast`, существующие запросы `groups` (active, не архивные, по branchId) и `rooms` (по branchId, не архивные, `orderBy('name')`).
- Produces: `RoomScheduleGrid({ branchId })` — тот же публичный интерфейс, используется в `DashboardPage.jsx` без изменений.

**Запись в Firestore (по образцу `RoomsPage.jsx`):**
- Вместимость: `updateDoc(doc(db, 'groups', id), { capacity, updatedAt: serverTimestamp(), updatedBy: user.uid })`.
- Переименование: `updateDoc(doc(db, 'rooms', id), { name, updatedAt: serverTimestamp(), updatedBy: user.uid })`.
- Добавить кабинет: `addDoc(collection(db, 'rooms'), { name: nextRoomName(rooms), capacity: DEFAULT_GROUP_CAPACITY, branchId, isArchived: false, createdAt, createdBy, updatedAt, updatedBy })`.
- Убрать последний кабинет (архивация, не удаление): как `requestArchive` + `confirmArchive`: если у кабинета есть не архивные группы (запрос `groups` по `roomId`, `isArchived == false`) — `notice` «В кабинете «N» есть группы: КОДЫ. Сначала переведите их в другой кабинет.» и ничего не писать; иначе `updateDoc(..., { isArchived: true, archivedAt, updatedAt, updatedBy })`. Подтверждение через `ConfirmDialog`, как в `RoomsPage.jsx` (Читать ConfirmDialog там же).
- Ошибки записи: toast `type: 'error'`. Успех: короткий toast («Вместимость сохранена» не показывать на каждый клик «+»/«−»; только на ошибки).
- Фильтр по `dayType` (`g.schedule.type === dayType`) остаётся здесь, в `RoomScheduleView` приходят уже отфильтрованные группы. `studentsCount` берётся как есть.
- `canEdit` берётся из роли (см. `src/lib/roles.js`; если нет подходящей функции — `true`, дашборд админский).
- Новых чтений не добавлять, кроме разового `getDocs` перед архивацией.

- [ ] **Step 1:** Заменить `RoomScheduleGrid.jsx`: хуки и мемо-запросы оставить как есть (запросы обязаны быть в `useMemo`, иначе бесконечная подписка), добавить обработчики записи, вернуть `<RoomScheduleView …/>` внутри `Card` с заголовком «Расписание кабинетов» (`SectionTitle`).
- [ ] **Step 2: Проверка**

Run: `npm run check:design | tail -2 && npm run test:lib 2>&1 | tail -4 && npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: `ок`, 8 pass, без новых замечаний, `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/RoomScheduleGrid.jsx
git commit -m "feat(rooms): RoomScheduleGrid пишет вместимость группы, переименование, добавление и архивацию кабинетов

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

- 3 столбца и блоки ниже: Task 1 `chunkRooms`, Task 2 п.4.
- Переименование кабинета: Task 2 п.4, Task 3.
- Вместимость группы (по умолчанию 12, 1…30), места под карточкой: Task 1, Task 2 п.5, Task 3.
- Время крупно внутри карточки: Task 2 п.5.
- Учителя: число учеников, время и кабинет занятий: Task 2 п.3 и `teacherStats`.
- Добавить/убрать кабинеты: Task 2 п.1, Task 3.
- Токены дизайна и `check:design`: Global Constraints, Task 2–3 проверки.
- Типы: `groupCapacity`, `seatStates`, `chunkRooms`, `blockTimes`, `teacherStats`, `nextRoomName`, `RoomScheduleView` пропсы названы одинаково в Tasks 1–3.

Вне охвата: поле вместимости в форме группы (`GroupFormModal`), правила Firestore (запись в `groups` и `rooms` для admin уже разрешена), права «только чтение» для учителя на дашборде.
