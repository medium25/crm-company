# Расписание операторов и ручной перевод лидов — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Новые лиды в первую очередь достаются оператору, у которого сейчас рабочее время по расписанию (дефицит карточек — только fallback, когда никто не работает); в Настройках появляется ручной перевод активных лидов между операторами — по отдельности (сгруппировано по стадии) и одной кнопкой «перевести всех».

**Architecture:** Два места создания лида (`src/lib/leadFunnel.js` для React-приложения, `appsscript/Code.gs` для Apps Script Web API) получают параллельную, но независимую реализацию одной и той же логики фильтрации по расписанию — общего рантайма между ними нет. Расписание и ручной перевод — новый функционал в `LeadAssignmentTab.jsx` (Настройки → Распределение лидов): три новых компонента (`OperatorScheduleModal`, `OperatorLeadsPanel`, `TransferAllLeadsModal`) плюс новые Firestore-хелперы в `leadFunnel.js`.

**Tech Stack:** React 19 + Firestore JS SDK (клиент пишет в Firestore напрямую, backend'а нет) + Google Apps Script (второй, независимый рантайм для внешнего API).

## Global Constraints

- Расписание хранится в `settings/{branchId}.operatorSchedules`, НЕ на `staff/{id}` — правило Firestore `staff.update` блокирует admin-роль на не-`teacher` записях (см. `firestore.rules:24`), `settings` пишется любой admin-ролью без ограничений.
- `WeekSchedule` — массив длины 7, индекс = `date.getDay()` (0=Вс…6=Сб), та же конвенция, что в `src/lib/schedule.js`. Элемент — `null` (выходной) или `{start: "HH:MM", end: "HH:MM"}`.
- Нет записи о дне/операторе в расписании → тех.дефолт «работает всегда» (не блокирует распределение молча).
- Часы сравниваются как есть (окружение выполнения), без привязки к `branch.timezone` — так же, как уже работает `isWithinWorkingHours` в `leadFunnel.js`.
- Ручной перевод лида меняет только `assignedOperator` — `funnelStage`/`stageHistory`/дедлайн-поля не трогаются.
- Батч-запись переводов — чанками по 400 (лимит Firestore batch — 500).
- В проекте нет тестового фреймворка (нет `vitest`/`jest`, `package.json` их не содержит) — не добавляем его ради этой задачи. Чистые функции проверяются одноразовым node-скриптом с `node:assert/strict` (по образцу уже существующих `scripts/*.mjs`), UI и Firestore-зависимый код — вручную в браузере (Task 9).
- `appsscript/Code.gs` — не часть Vite-сборки, локально не выполняется и не деплоится автоматически (см. `appsscript/README.md`) — деплой вручную остаётся за пользователем, эта задача только правит файл-источник.

---

### Task 1: Чистая логика расписания — `isOperatorWorkingAt` / `selectOnShiftOperatorIds`

**Files:**
- Modify: `src/lib/leadFunnel.js`
- Test: `scripts/test-lead-assignment.mjs` (создать)

**Interfaces:**
- Produces: `isOperatorWorkingAt(workSchedule: Array<{start:string,end:string}|null>|undefined, date: Date): boolean`, `selectOnShiftOperatorIds(operators: Array<{id: string, workSchedule?: Array}>, date: Date): Array<string>` — используются в Task 2.

- [ ] **Step 1: Написать проверочный скрипт (упадёт — функций ещё нет)**

Создать `scripts/test-lead-assignment.mjs`:

```js
// scripts/test-lead-assignment.mjs
// Разовая проверка чистой логики расписания операторов — без фреймворка,
// по образцу scripts/test-leads-api.mjs. Запуск: node scripts/test-lead-assignment.mjs
import assert from 'node:assert/strict';
import { isOperatorWorkingAt, selectOnShiftOperatorIds } from '../src/lib/leadFunnel.js';

// Среда, 19.08.2026, 10:00 — оператор A работает 09:00-14:00, B — 14:00-18:00
const wed10am = new Date(2026, 7, 19, 10, 0);
assert.equal(wed10am.getDay(), 3, 'проверь дату теста — ожидалась среда');

const scheduleA = [null, { start: '09:00', end: '18:00' }, { start: '09:00', end: '18:00' }, { start: '09:00', end: '14:00' }, { start: '09:00', end: '18:00' }, { start: '09:00', end: '18:00' }, null];
const scheduleB = [null, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, null];

assert.equal(isOperatorWorkingAt(scheduleA, wed10am), true, 'A работает в 10:00 по среде (09-14)');
assert.equal(isOperatorWorkingAt(scheduleB, wed10am), false, 'B ещё не начал (14-18)');
assert.equal(isOperatorWorkingAt(undefined, wed10am), true, 'нет расписания — тех.дефолт "всегда работает"');

const sunday = new Date(2026, 7, 16, 10, 0);
assert.equal(sunday.getDay(), 0, 'проверь дату теста — ожидалось воскресенье');
assert.equal(isOperatorWorkingAt(scheduleA, sunday), false, 'воскресенье — null в расписании, явный выходной');

const boundary = new Date(2026, 7, 19, 14, 0);
assert.equal(isOperatorWorkingAt(scheduleA, boundary), false, '14:00 — уже вне 09:00-14:00 (end не включён)');
assert.equal(isOperatorWorkingAt(scheduleB, boundary), true, '14:00 — начало смены B (start включён)');

const operators = [
  { id: 'opA', workSchedule: scheduleA },
  { id: 'opB', workSchedule: scheduleB },
];
assert.deepEqual(selectOnShiftOperatorIds(operators, wed10am), ['opA'], 'в 10:00 работает только A');

const afterHours = new Date(2026, 7, 19, 20, 0);
assert.deepEqual(selectOnShiftOperatorIds(operators, afterHours), [], 'в 20:00 не работает никто — пустой список, fallback решает вызывающая сторона');

console.log('OK: lead-assignment schedule tests passed');
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `node scripts/test-lead-assignment.mjs`
Expected: `SyntaxError` или `TypeError: isOperatorWorkingAt is not a function` (функции ещё не экспортированы).

- [ ] **Step 3: Реализовать функции в `leadFunnel.js`**

Добавить в конец `src/lib/leadFunnel.js` (после `assignLeastLoadedOperator`, перед закрывающим `}` файла нет — просто в конец файла):

```js

/**
 * Работает ли оператор в указанный момент — расписание из
 * settings/{branchId}.operatorSchedules[operatorId] (Настройки →
 * Распределение лидов → «Расписание»). `null` в дне — явный выходной,
 * `undefined` (весь массив или запись оператора отсутствует) — тех.дефолт
 * «работает всегда», чтобы ненастроенное расписание молча не выключало
 * оператора из распределения.
 * @param {Array<{start: string, end: string}|null>|undefined} workSchedule
 * @param {Date} date
 * @returns {boolean}
 */
export function isOperatorWorkingAt(workSchedule, date) {
  if (!workSchedule) return true;
  const today = workSchedule[date.getDay()];
  if (today === undefined) return true;
  if (today === null) return false;
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return hhmm >= today.start && hhmm < today.end;
}

/**
 * Операторы из списка, у которых сейчас рабочее время — приоритетное
 * подмножество для назначения лида (см. assignOperatorForLead).
 * @param {Array<{id: string, workSchedule?: Array}>} operators
 * @param {Date} date
 * @returns {Array<string>} id операторов
 */
export function selectOnShiftOperatorIds(operators, date) {
  return operators.filter((op) => isOperatorWorkingAt(op.workSchedule, date)).map((op) => op.id);
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `node scripts/test-lead-assignment.mjs`
Expected: `OK: lead-assignment schedule tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/leadFunnel.js scripts/test-lead-assignment.mjs
git commit -m "feat(leads): add operator working-hours gate (isOperatorWorkingAt)"
```

---

### Task 2: Оркестрация назначения с учётом расписания — `assignOperatorForLead`

**Files:**
- Modify: `src/lib/leadFunnel.js`

**Interfaces:**
- Consumes: `assignLeastLoadedOperator(db, branchId, operatorIds)` (существующая, без изменений), `selectOnShiftOperatorIds` (Task 1).
- Produces: `getOperatorSchedules(db: Firestore, branchId: string): Promise<Record<string, Array>>`, `assignOperatorForLead(db: Firestore, branchId: string, operators: Array<{id: string, workSchedule?: Array}>, createdAt: Date): Promise<string|null>` — используются в Task 3 и Task 4 (портированная копия).

- [ ] **Step 1: Добавить обе функции**

Добавить в конец `src/lib/leadFunnel.js`:

```js

/**
 * Расписания операторов — settings/{branchId}.operatorSchedules (см. Global
 * Constraints: живёт на settings, не на staff/{id}, из-за ограничения
 * firestore.rules на staff.update для admin-роли).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @returns {Promise<Record<string, Array<{start: string, end: string}|null>>>}
 */
export async function getOperatorSchedules(db, branchId) {
  const snap = await getDoc(doc(db, 'settings', branchId));
  return snap.data()?.operatorSchedules ?? {};
}

/**
 * Назначение лида с учётом расписания: сначала — наименее загруженный среди
 * операторов, у которых сейчас рабочее время; если таких нет — прежняя
 * логика дефицита среди ВСЕХ переданных операторов.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {Array<{id: string, workSchedule?: Array}>} operators активные операторы с их расписанием
 * @param {Date} createdAt момент создания лида (может быть в прошлом — лид из Google Sheets)
 * @returns {Promise<string|null>}
 */
export async function assignOperatorForLead(db, branchId, operators, createdAt) {
  const onShiftIds = selectOnShiftOperatorIds(operators, createdAt);
  const candidateIds = onShiftIds.length > 0 ? onShiftIds : operators.map((op) => op.id);
  return assignLeastLoadedOperator(db, branchId, candidateIds);
}
```

- [ ] **Step 2: Проверить, что модуль загружается без ошибок**

Run: `node -e "import('./src/lib/leadFunnel.js').then(m => console.log(typeof m.assignOperatorForLead, typeof m.getOperatorSchedules))"`
Expected: `function function`

- [ ] **Step 3: Commit**

```bash
git add src/lib/leadFunnel.js
git commit -m "feat(leads): add schedule-aware assignOperatorForLead orchestration"
```

---

### Task 3: Подключить расписание к созданию лида в React (`StudentFormModal.jsx`)

**Files:**
- Modify: `src/components/students/StudentFormModal.jsx:11` (импорт), `src/components/students/StudentFormModal.jsx:76-77` (вызов)

**Interfaces:**
- Consumes: `getActiveLeadOperators(db, branchId)` (существующая), `getOperatorSchedules(db, branchId)` и `assignOperatorForLead(db, branchId, operators, createdAt)` (Task 2).

- [ ] **Step 1: Заменить импорт**

В `src/components/students/StudentFormModal.jsx` заменить строку 11:

```js
import { getActiveLeadOperators, assignLeastLoadedOperator } from '../../lib/leadFunnel.js';
```

на:

```js
import { getActiveLeadOperators, getOperatorSchedules, assignOperatorForLead } from '../../lib/leadFunnel.js';
```

- [ ] **Step 2: Заменить вызов назначения**

Заменить строки 76-77:

```js
        const operatorIds = await getActiveLeadOperators(db, activeBranchId);
        const assignedOperator = await assignLeastLoadedOperator(db, activeBranchId, operatorIds);
```

на:

```js
        const [operatorIds, operatorSchedules] = await Promise.all([
          getActiveLeadOperators(db, activeBranchId),
          getOperatorSchedules(db, activeBranchId),
        ]);
        const operators = operatorIds.map((id) => ({ id, workSchedule: operatorSchedules[id] }));
        const assignedOperator = await assignOperatorForLead(db, activeBranchId, operators, new Date());
```

- [ ] **Step 3: Проверить линтером**

Run: `npm run lint`
Expected: без ошибок в `StudentFormModal.jsx` (может быть pre-existing warnings в других файлах — игнорировать, если не относятся к этому файлу).

- [ ] **Step 4: Commit**

```bash
git add src/components/students/StudentFormModal.jsx
git commit -m "feat(leads): use schedule-aware assignment when creating a lead"
```

---

### Task 4: Зеркало логики расписания в Apps Script (`Code.gs`)

**Files:**
- Modify: `appsscript/Code.gs:320-353` (`nextLeastLoadedOperator_`), `appsscript/Code.gs:394` (вызов в `createLead_`)

**Interfaces:**
- Produces: `isOperatorWorkingAt_(workSchedule, date)` — приватный хелпер, портированная копия `isOperatorWorkingAt` из `leadFunnel.js` (общего рантайма между React и Apps Script нет, дублирование обязательно).

- [ ] **Step 1: Добавить `isOperatorWorkingAt_` перед `nextLeastLoadedOperator_`**

В `appsscript/Code.gs`, прямо перед функцией `nextLeastLoadedOperator_` (строка 320), вставить:

```js
/**
 * Работает ли оператор в указанный момент — то же самое, что
 * isOperatorWorkingAt в src/lib/leadFunnel.js, портировано вручную (общего
 * модуля между React и Apps Script рантаймами нет).
 */
function isOperatorWorkingAt_(workSchedule, date) {
  if (!workSchedule) return true;
  const today = workSchedule[date.getDay()];
  if (today === undefined) return true;
  if (today === null) return false;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const hhmm = hh + ':' + mm;
  return hhmm >= today.start && hhmm < today.end;
}

```

- [ ] **Step 2: Заменить `nextLeastLoadedOperator_` целиком**

Текущая функция (строки 320-353):

```js
function nextLeastLoadedOperator_(branchId) {
  const settings = fromFsDoc_(fsGetOptional_(`/settings/${branchId}`) || { fields: {} });
  let ids = settings.activeLeadOperators;
  if (!ids || !ids.length) {
    const operatorsResult = runQuery_(
      'staff',
      [
        { field: 'role', op: 'IN', value: ['ceo', 'manager', 'admin'] },
        { field: 'branchIds', op: 'ARRAY_CONTAINS', value: branchId },
      ],
      { limit: 30 },
    );
    ids = operatorsResult.map((s) => s.id);
  }
  if (!ids.length) return null;

  let best = null;
  let bestCount = Infinity;
  ids.forEach((id) => {
    const leads = runQuery_(
      'students',
      [
        { field: 'assignedOperator', op: 'EQUAL', value: id },
        { field: 'funnelStage', op: 'IN', value: ['new', 'calling'] },
      ],
      { limit: 500 },
    );
    if (leads.length < bestCount) {
      bestCount = leads.length;
      best = id;
    }
  });
  return best;
}
```

заменить на (добавлен параметр `createdAt` и фильтр по расписанию с fallback):

```js
function nextLeastLoadedOperator_(branchId, createdAt) {
  const settings = fromFsDoc_(fsGetOptional_(`/settings/${branchId}`) || { fields: {} });
  let ids = settings.activeLeadOperators;
  if (!ids || !ids.length) {
    const operatorsResult = runQuery_(
      'staff',
      [
        { field: 'role', op: 'IN', value: ['ceo', 'manager', 'admin'] },
        { field: 'branchIds', op: 'ARRAY_CONTAINS', value: branchId },
      ],
      { limit: 30 },
    );
    ids = operatorsResult.map((s) => s.id);
  }
  if (!ids.length) return null;

  const schedules = settings.operatorSchedules || {};
  const onShiftIds = ids.filter((id) => isOperatorWorkingAt_(schedules[id], createdAt));
  const candidateIds = onShiftIds.length > 0 ? onShiftIds : ids;

  let best = null;
  let bestCount = Infinity;
  candidateIds.forEach((id) => {
    const leads = runQuery_(
      'students',
      [
        { field: 'assignedOperator', op: 'EQUAL', value: id },
        { field: 'funnelStage', op: 'IN', value: ['new', 'calling'] },
      ],
      { limit: 500 },
    );
    if (leads.length < bestCount) {
      bestCount = leads.length;
      best = id;
    }
  });
  return best;
}
```

- [ ] **Step 3: Обновить вызов в `createLead_`**

Заменить строку 394:

```js
  const assignedOperator = nextLeastLoadedOperator_(branchId);
```

на:

```js
  const assignedOperator = nextLeastLoadedOperator_(branchId, effectiveCreatedAt);
```

(`effectiveCreatedAt` уже определена выше в той же функции, строка 374 — реальный момент прихода лида, а не момент вызова API.)

- [ ] **Step 4: Проверить вручную**

Открыть `appsscript/Code.gs`, перечитать изменённый блок целиком (строки ~320-400) — `isOperatorWorkingAt_` определена до первого использования, `nextLeastLoadedOperator_` вызывается с двумя аргументами везде. Локально не выполняется (Apps Script рантайм) — деплой и проверка на реальном Web App остаются на пользователе, эта задача только готовит файл-источник.

- [ ] **Step 5: Commit**

```bash
git add appsscript/Code.gs
git commit -m "feat(leads): mirror schedule-aware assignment in Apps Script API"
```

---

### Task 5: Хелперы ручного перевода в `leadFunnel.js`

**Files:**
- Modify: `src/lib/leadFunnel.js:2` (импорт), конец файла (новый код)

**Interfaces:**
- Produces: `NON_TERMINAL_STAGES: Array<string>`, `getActiveLeadIdsForOperator(db: Firestore, operatorId: string): Promise<Array<string>>`, `reassignLeadsToOperator(db: Firestore, leadIds: Array<string>, newOperatorId: string, user: {uid: string}): Promise<void>` — используются в Task 6-8.

- [ ] **Step 1: Расширить импорт firebase/firestore**

Заменить строку 2:

```js
import { doc, getDoc, updateDoc, collection, query, where, getCountFromServer, serverTimestamp } from 'firebase/firestore';
```

на:

```js
import { doc, getDoc, updateDoc, collection, query, where, getCountFromServer, serverTimestamp, writeBatch, getDocs } from 'firebase/firestore';
```

- [ ] **Step 2: Добавить хелперы в конец файла**

```js

/** Нетерминальные стадии воронки — "активный" лид для целей ручного перевода между операторами. */
export const NON_TERMINAL_STAGES = ['new', 'calling', 'trial_scheduled', 'trial_completed', 'closing'];

/**
 * id всех активных лидов оператора — для «Перевести всех» (без разворота
 * списка в LeadAssignmentTab).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} operatorId
 * @returns {Promise<Array<string>>}
 */
export async function getActiveLeadIdsForOperator(db, operatorId) {
  const snap = await getDocs(
    query(collection(db, 'students'), where('assignedOperator', '==', operatorId), where('funnelStage', 'in', NON_TERMINAL_STAGES)),
  );
  return snap.docs.map((d) => d.id);
}

/**
 * Массовый перевод лидов другому оператору — меняет только владельца
 * (assignedOperator), funnelStage/stageHistory/дедлайны не трогаются:
 * прогресс по воронке остаётся как есть, переезжает только ответственный.
 * Чанки по 400 — лимит Firestore batch 500, запас на случай большого списка
 * у одного оператора.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Array<string>} leadIds
 * @param {string} newOperatorId
 * @param {{uid: string}} user
 */
export async function reassignLeadsToOperator(db, leadIds, newOperatorId, user) {
  const CHUNK = 400;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const id of leadIds.slice(i, i + CHUNK)) {
      batch.update(doc(db, 'students', id), {
        assignedOperator: newOperatorId,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    }
    await batch.commit();
  }
}
```

- [ ] **Step 3: Проверить, что модуль загружается**

Run: `node -e "import('./src/lib/leadFunnel.js').then(m => console.log(m.NON_TERMINAL_STAGES, typeof m.reassignLeadsToOperator, typeof m.getActiveLeadIdsForOperator))"`
Expected: `[ 'new', 'calling', 'trial_scheduled', 'trial_completed', 'closing' ] function function`

- [ ] **Step 4: Commit**

```bash
git add src/lib/leadFunnel.js
git commit -m "feat(leads): add manual reassignment helpers (batch write, active-lead lookup)"
```

---

### Task 6: Модалка расписания оператора — `OperatorScheduleModal.jsx`

**Files:**
- Create: `src/components/settings/OperatorScheduleModal.jsx`
- Modify: `src/components/settings/LeadAssignmentTab.jsx` (подключить кнопку + модалку)

**Interfaces:**
- Consumes: `useAuth`, `useBranch`, `useToast`, `Modal`, `Button`, `Input` (существующие UI-компоненты).
- Produces: `<OperatorScheduleModal operator={{id,fullName}|null} schedule={Array|undefined} onClose={fn} />`.

- [ ] **Step 1: Создать компонент**

Создать `src/components/settings/OperatorScheduleModal.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

// Порядок отображения — Пн→Вс; индекс каждого дня в state/массиве —
// реальный date.getDay() (0=Вс), та же конвенция что в lib/schedule.js.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };
const DEFAULT_TIME = { start: '09:00', end: '18:00' };

function toDraft(schedule) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = schedule?.[i];
    return day ? { enabled: true, start: day.start, end: day.end } : { enabled: false, ...DEFAULT_TIME };
  });
}

/**
 * Расписание одного оператора — settings/{branchId}.operatorSchedules[operator.id],
 * не staff/{id} (staff.update запрещён для admin-роли на не-teacher
 * записях, settings — нет). Пишет только свой ключ через merge:true —
 * вложенный объект мержится Firestore по ключам, соседние операторы не
 * задеваются.
 * @param {Object} props
 * @param {{id: string, fullName: string}|null} props.operator null — закрыто
 * @param {Array<{start: string, end: string}|null>|undefined} props.schedule текущее расписание оператора
 * @param {() => void} props.onClose
 */
export function OperatorScheduleModal({ operator, schedule, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(() => toDraft(schedule));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (operator) setDraft(toDraft(schedule));
  }, [operator, schedule]);

  const setDay = (dayIndex, patch) => {
    setDraft((d) => d.map((day, i) => (i === dayIndex ? { ...day, ...patch } : day)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const weekSchedule = draft.map((day) => (day.enabled ? { start: day.start, end: day.end } : null));
      await setDoc(
        doc(db, 'settings', activeBranchId),
        { operatorSchedules: { [operator.id]: weekSchedule }, updatedAt: serverTimestamp(), updatedBy: user.uid },
        { merge: true },
      );
      showToast('Расписание сохранено.');
      onClose();
    } catch {
      showToast('Не удалось сохранить расписание.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(operator)}
      onClose={onClose}
      title={`Расписание: ${operator?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {DAY_ORDER.map((dayIndex) => {
          const day = draft[dayIndex];
          return (
            <div key={dayIndex} className="flex items-center gap-3">
              <label className="flex w-24 shrink-0 items-center gap-2 text-[15px] text-text">
                <input type="checkbox" checked={day.enabled} onChange={(e) => setDay(dayIndex, { enabled: e.target.checked })} />
                {DAY_LABELS[dayIndex]}
              </label>
              <Input type="time" value={day.start} disabled={!day.enabled} onChange={(e) => setDay(dayIndex, { start: e.target.value })} />
              <span className="text-muted">—</span>
              <Input type="time" value={day.end} disabled={!day.enabled} onChange={(e) => setDay(dayIndex, { end: e.target.value })} />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Подключить в `LeadAssignmentTab.jsx`**

В `src/components/settings/LeadAssignmentTab.jsx`:

Заменить импорт иконок (строка 3):

```js
import { Users } from 'lucide-react';
```

на:

```js
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
```

Добавить импорт после `SkeletonRow` (строка 13):

```js
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { OperatorScheduleModal } from './OperatorScheduleModal.jsx';
```

Добавить состояние после `const [savingId, setSavingId] = useState(null);` (строка 46):

```js
  const [scheduleTarget, setScheduleTarget] = useState(null);
```

Добавить колонку `__actions` в конец массива `columns` (после блока `__active`, перед закрывающим `];` на строке 120):

```js
    {
      key: '__actions',
      label: '',
      width: '48px',
      render: (m) => (
        <DropdownMenu items={[{ label: 'Расписание', onClick: () => setScheduleTarget(m) }]} />
      ),
    },
```

Заменить обёртку и добавить модалку в `return` (строки 122-130):

```jsx
  return (
    <div className="max-w-4xl">
      <p className="mb-4 text-[15px] text-muted">
        Новый лид в первую очередь достаётся активному оператору, у которого сейчас рабочее время по расписанию, и
        только среди них — наименее загруженному. Если по расписанию никто не работает — прежняя логика: наименее
        загруженный среди всех активных.
      </p>
      <Table columns={columns} rows={staffList} />
      <OperatorScheduleModal
        operator={scheduleTarget}
        schedule={settingsDoc?.operatorSchedules?.[scheduleTarget?.id]}
        onClose={() => setScheduleTarget(null)}
      />
    </div>
  );
```

Обновить оба вызова `<SkeletonRow columns={3} />` (строки 68-69) на `columns={4}` (стало на одну колонку больше).

- [ ] **Step 3: Проверить линтером**

Run: `npm run lint`
Expected: без ошибок в изменённых/новых файлах.

- [ ] **Step 4: Ручная проверка в браузере**

Запустить дев-сервер (`icon-crm-dev` из `.claude/launch.json`), открыть Настройки → Распределение лидов, убедиться:
- В таблице появилась колонка с кнопкой действий (⋮).
- Клик → «Расписание» открывает модалку с 7 днями (Пн…Вс), чекбоксами и полями времени.
- Включить/выключить пару дней, поменять время, «Сохранить» — тост «Расписание сохранено.», модалка закрылась.
- Обновить страницу — значения расписания сохранились (перечитаны из Firestore).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/OperatorScheduleModal.jsx src/components/settings/LeadAssignmentTab.jsx
git commit -m "feat(settings): add operator working-hours schedule editor"
```

---

### Task 7: Разворот со списком лидов оператора — `OperatorLeadsPanel.jsx`

**Files:**
- Create: `src/components/settings/OperatorLeadsPanel.jsx`
- Modify: `src/components/settings/LeadAssignmentTab.jsx`

**Interfaces:**
- Consumes: `NON_TERMINAL_STAGES`, `reassignLeadsToOperator` (Task 5), `COLUMNS`/`withStageOverrides` из `src/components/leads/columns.js`, `formatPhone` из `src/lib/format.js`.
- Produces: `<OperatorLeadsPanel operator={{id,fullName}} operators={Array<{id,fullName}>} stageOverrides={Object|undefined} onClose={fn} />`.

- [ ] **Step 1: Создать компонент**

Создать `src/components/settings/OperatorLeadsPanel.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { NON_TERMINAL_STAGES, reassignLeadsToOperator } from '../../lib/leadFunnel.js';
import { withStageOverrides } from '../leads/columns.js';
import { formatPhone } from '../../lib/format.js';

/**
 * Активные лиды оператора, сгруппированные по стадии воронки, с выбором и
 * переводом другому оператору. Разворачивается под таблицей операторов в
 * LeadAssignmentTab при клике на стрелку строки.
 * @param {Object} props
 * @param {{id: string, fullName: string}} props.operator оператор-источник
 * @param {Array<{id: string, fullName: string}>} props.operators все операторы для выбора получателя (источник исключается внутри)
 * @param {Record<string, {label?: string, color?: string}>} [props.stageOverrides]
 * @param {() => void} props.onClose
 */
export function OperatorLeadsPanel({ operator, operators, stageOverrides, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const leadsQuery = useMemo(
    () =>
      db
        ? query(
            collection(db, 'students'),
            where('assignedOperator', '==', operator.id),
            where('funnelStage', 'in', NON_TERMINAL_STAGES),
          )
        : null,
    [operator.id],
  );
  const { data: leads, loading } = useCollection(leadsQuery);

  const [selected, setSelected] = useState(() => new Set());
  const [targetId, setTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    setSelected(new Set());
    setTargetId('');
  }, [operator.id]);

  const stages = useMemo(
    () => withStageOverrides(stageOverrides).filter((c) => NON_TERMINAL_STAGES.includes(c.key)),
    [stageOverrides],
  );

  const groups = stages
    .map((stage) => ({ stage, leads: leads.filter((l) => (l.funnelStage ?? 'new') === stage.key) }))
    .filter((g) => g.leads.length > 0);

  const toggleLead = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (groupLeads) => {
    const ids = groupLeads.map((l) => l.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const targetOptions = operators.filter((op) => op.id !== operator.id);

  const handleTransfer = async () => {
    if (selected.size === 0 || !targetId) return;
    setTransferring(true);
    try {
      await reassignLeadsToOperator(db, Array.from(selected), targetId, user);
      showToast(`Переведено лидов: ${selected.size}.`);
      onClose();
    } catch {
      showToast('Не удалось перевести лиды.', { type: 'error' });
    } finally {
      setTransferring(false);
    }
  };

  return (
    <div className="mt-2 rounded-2xl border border-border bg-surface-alt p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-text">Активные лиды: {operator.fullName}</h3>
        <button type="button" onClick={onClose} className="text-[13px] text-muted hover:text-navy">
          Свернуть
        </button>
      </div>

      {loading ? (
        <p className="text-[15px] text-muted">Загрузка…</p>
      ) : groups.length === 0 ? (
        <p className="text-[15px] text-muted">У оператора нет активных лидов.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(({ stage, leads: groupLeads }) => {
            const allSelected = groupLeads.every((l) => selected.has(l.id));
            return (
              <div key={stage.key}>
                <label className="mb-1.5 flex items-center gap-2 text-[13px] font-bold text-muted">
                  <input type="checkbox" checked={allSelected} onChange={() => toggleGroup(groupLeads)} />
                  {stage.label} ({groupLeads.length})
                </label>
                <div className="flex flex-col gap-1">
                  {groupLeads.map((lead) => (
                    <label
                      key={lead.id}
                      className="flex items-center gap-2 rounded-field px-2 py-1 text-[15px] text-text hover:bg-surface"
                    >
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleLead(lead.id)} />
                      {lead.fullName} <span className="text-muted">· {formatPhone(lead.phone)}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <div className="w-64">
          <Select
            options={[{ value: '', label: 'Кому перевести' }, ...targetOptions.map((op) => ({ value: op.id, label: op.fullName }))]}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
        </div>
        <Button onClick={handleTransfer} loading={transferring} disabled={selected.size === 0 || !targetId}>
          Перевести выбранных ({selected.size})
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Подключить в `LeadAssignmentTab.jsx`**

Добавить импорт (рядом с импортом `OperatorScheduleModal`):

```js
import { OperatorLeadsPanel } from './OperatorLeadsPanel.jsx';
```

Добавить состояние рядом с `scheduleTarget`:

```js
  const [expandedId, setExpandedId] = useState(null);
```

Добавить колонку `__expand` в массив `columns`, ПЕРЕД колонкой `__actions`:

```js
    {
      key: '__expand',
      label: '',
      width: '40px',
      render: (m) => (
        <button
          type="button"
          onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
          aria-label={expandedId === m.id ? 'Свернуть лиды оператора' : 'Показать лиды оператора'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
        >
          {expandedId === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ),
    },
```

В `return`, сразу после `<Table columns={columns} rows={staffList} />`, добавить:

```jsx
      {expandedId && (
        <OperatorLeadsPanel
          operator={staffList.find((m) => m.id === expandedId)}
          operators={staffList.filter((m) => isActive(m.id))}
          stageOverrides={settingsDoc?.leadStageOverrides}
          onClose={() => setExpandedId(null)}
        />
      )}
```

Обновить оба `<SkeletonRow columns={4} />` (из Task 6) на `columns={5}`.

- [ ] **Step 3: Проверить линтером**

Run: `npm run lint`
Expected: без ошибок в изменённых/новых файлах.

- [ ] **Step 4: Ручная проверка в браузере**

На доске «Заявки» убедиться, что у выбранного тестового оператора есть хотя бы один активный лид (создать тестовый лид через «+» в колонке «Новый лид», если нет). В Настройки → Распределение лидов:
- Клик по стрелке разворота у этого оператора → под таблицей появляется панель с группами по стадиям.
- Чекбокс группы выбирает все карточки группы; снятие чекбокса — снимает.
- Выбрать оператора-получателя, нажать «Перевести выбранных» → тост с числом, панель закрылась.
- На доске «Заявки» карточка теперь у нового оператора, стадия не изменилась.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/OperatorLeadsPanel.jsx src/components/settings/LeadAssignmentTab.jsx
git commit -m "feat(settings): add per-lead manual reassignment grouped by funnel stage"
```

---

### Task 8: Кнопка «Перевести всех» — `TransferAllLeadsModal.jsx`

**Files:**
- Create: `src/components/settings/TransferAllLeadsModal.jsx`
- Modify: `src/components/settings/LeadAssignmentTab.jsx`

**Interfaces:**
- Consumes: `getActiveLeadIdsForOperator`, `reassignLeadsToOperator` (Task 5).
- Produces: `<TransferAllLeadsModal operator={{id,fullName}|null} operators={Array<{id,fullName}>} onClose={fn} />`.

- [ ] **Step 1: Создать компонент**

Создать `src/components/settings/TransferAllLeadsModal.jsx`:

```jsx
import { useState } from 'react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { getActiveLeadIdsForOperator, reassignLeadsToOperator } from '../../lib/leadFunnel.js';

/**
 * Перевод ВСЕХ активных лидов оператора другому — без разворота списка
 * (кнопка «Перевести все лиды» в меню действий строки оператора).
 * @param {Object} props
 * @param {{id: string, fullName: string}|null} props.operator оператор-источник, null — закрыто
 * @param {Array<{id: string, fullName: string}>} props.operators все операторы для выбора получателя (источник исключается внутри)
 * @param {() => void} props.onClose
 */
export function TransferAllLeadsModal({ operator, operators, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [targetId, setTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);

  const targetOptions = operators.filter((op) => op.id !== operator?.id);

  const handleTransfer = async () => {
    if (!targetId || !operator) return;
    setTransferring(true);
    try {
      const leadIds = await getActiveLeadIdsForOperator(db, operator.id);
      if (leadIds.length === 0) {
        showToast('У оператора нет активных лидов.');
        onClose();
        return;
      }
      await reassignLeadsToOperator(db, leadIds, targetId, user);
      showToast(`Переведено лидов: ${leadIds.length}.`);
      onClose();
    } catch {
      showToast('Не удалось перевести лиды.', { type: 'error' });
    } finally {
      setTransferring(false);
      setTargetId('');
    }
  };

  return (
    <Modal
      open={Boolean(operator)}
      onClose={onClose}
      title={`Перевести все лиды: ${operator?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={transferring}>
            Отмена
          </Button>
          <Button onClick={handleTransfer} loading={transferring} disabled={!targetId}>
            Перевести
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-text">
          Все активные лиды оператора <b>{operator?.fullName}</b> (Новый лид, Дозвон, Пробный, Дожим) перейдут
          выбранному оператору. Стадия и прогресс по каждому лиду не меняются.
        </p>
        <Select
          label="Кому перевести"
          options={[{ value: '', label: 'Выбрать' }, ...targetOptions.map((op) => ({ value: op.id, label: op.fullName }))]}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        />
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Подключить в `LeadAssignmentTab.jsx`**

Добавить импорт:

```js
import { TransferAllLeadsModal } from './TransferAllLeadsModal.jsx';
```

Добавить состояние рядом с `expandedId`:

```js
  const [transferAllTarget, setTransferAllTarget] = useState(null);
```

В колонке `__actions` (добавленной в Task 6) добавить второй пункт меню:

```js
    {
      key: '__actions',
      label: '',
      width: '48px',
      render: (m) => (
        <DropdownMenu
          items={[
            { label: 'Расписание', onClick: () => setScheduleTarget(m) },
            { label: 'Перевести все лиды', onClick: () => setTransferAllTarget(m) },
          ]}
        />
      ),
    },
```

В `return`, после `<OperatorScheduleModal .../>`, добавить:

```jsx
      <TransferAllLeadsModal
        operator={transferAllTarget}
        operators={staffList.filter((m) => isActive(m.id))}
        onClose={() => setTransferAllTarget(null)}
      />
```

- [ ] **Step 3: Проверить линтером**

Run: `npm run lint`
Expected: без ошибок в изменённых/новых файлах.

- [ ] **Step 4: Ручная проверка в браузере**

У оператора с активными лидами: меню действий → «Перевести все лиды» → открывается модалка с пояснением и селектом получателя. Выбрать получателя, «Перевести» → тост с числом, модалка закрылась. На доске «Заявки» — все карточки этого оператора теперь у получателя, стадии не изменились. Повторный вызов на операторе без активных лидов → тост «У оператора нет активных лидов.», без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/TransferAllLeadsModal.jsx src/components/settings/LeadAssignmentTab.jsx
git commit -m "feat(settings): add one-click transfer of all active leads to another operator"
```

---

### Task 9: Сквозная проверка в браузере

**Files:** нет изменений — только verification.

- [ ] **Step 1: Запустить дев-сервер и открыть Настройки → Распределение лидов**

Использовать `.claude/launch.json` конфигурацию `icon-crm-dev` (или `npm run dev` вручную), открыть `/#/settings` (вкладка «Распределение лидов»), убедиться, что страница рендерится без ошибок в консоли.

- [ ] **Step 2: Проверить приоритет расписания при создании лида**

Через модалку «Расписание» выставить двум тестовым операторам A и B заведомо разные окна (например A — текущий час входит в диапазон, B — не входит). Создать новый лид (кнопка «+» в колонке «Новый лид» на доске «Заявки»). Открыть карточку/навести на цветной индикатор оператора — назначен должен быть A (тот, кто сейчас «на смене»), даже если у B было меньше карточек до этого.

- [ ] **Step 3: Проверить fallback на дефицит**

Выставить обоим тестовым операторам расписание, не включающее текущее время (оба «не на смене»). Создать ещё один лид — назначение должно уйти по прежней логике (наименее загруженный среди всех активных), т.е. поведение не отличается от того, что было до этой задачи.

- [ ] **Step 4: Проверить ручной перевод (по одному и группами)**

В развороте оператора с несколькими лидами на разных стадиях: выбрать по одной карточке из двух разных групп, перевести выбранных другому оператору — на доске «Заявки» карточки должны сменить владельца (виден по цвету/подписи оператора), стадия каждой карточки — без изменений.

- [ ] **Step 5: Проверить «Перевести всех»**

На операторе с несколькими активными лидами — «Перевести все лиды» другому оператору, подтвердить счётчик в тосте совпадает с числом карточек на доске, у которых сменился владелец.

- [ ] **Step 6: Прогнать полный lint по проекту**

Run: `npm run lint`
Expected: без новых ошибок (сравнить с состоянием до начала задачи, если там уже были unrelated warnings).

- [ ] **Step 7: Финальный commit (если Step 1-6 потребовали правок)**

Если во время проверки нашлись и исправлены баги — закоммитить отдельно с понятным сообщением, например:

```bash
git add -A
git commit -m "fix(leads): address issues found during manual e2e verification"
```

Если правок не потребовалось — commit не нужен, задача закрыта на Task 8.
