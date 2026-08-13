# Заявки: 7-стадийная воронка — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить 6-колоночную date-bucket доску «Заявки» на 7-стадийную
воронку продаж (`new → calling → trial_scheduled → trial_completed →
closing → won/lost`) с round-robin назначением оператора, визуальным
SLA-таймером, авто-переходами на основе уже существующего трекера звонков,
структурированными причинами отказа, авто-переходом в «Оплачено» при первом
платеже и еженедельным отчётом по воронке — по `docs/superpowers/specs/
2026-08-13-leads-funnel-redesign.md`.

**Architecture:** Стадия хранится в `students/{id}.funnelStage`, каждый
переход дописывает запись в `students/{id}.stageHistory` (для отчёта) через
единый хелпер `advanceStage()` в новом `src/lib/leadFunnel.js` — все места,
что меняют стадию (drag/меню, авто-переход после звонка, отказ, оплата),
идут через него. Доска (`LeadsPage.jsx`) читает `students` по
`funnelStage in [...]` вместо `status in [lead,trial]` — это осознанное
архитектурное решение (см. ниже), без него `won`/`lost` карточки исчезали
бы с доски мгновенно после перехода.

**Tech Stack:** React 19, Firestore (`firebase` JS SDK v12), Tailwind CSS,
`lucide-react`, `date-fns` (уже в зависимостях, только форматирование/
арифметика дат — не UI-библиотека).

## Важное архитектурное решение: почему доска не фильтрует `isArchived`

Текущий запрос доски — `where('isArchived','==',false) AND where('status',
'in',['lead','trial'])`. `DeclineLeadModal` при отказе ставит
`isArchived:true` (не меняется в этом плане — так же скрывает лида из
остальных списков студентов, это правильно). Если доска продолжит
фильтровать `isArchived==false`, колонка «Отказ» будет **всегда пустой** —
карточка исчезает из выдачи в тот же момент, когда становится `lost`, то
есть колонка технически недостижима для просмотра.

Решение: запрос доски убирает `isArchived`/`status` фильтры вовсе и
переходит на `where('funnelStage', 'in', [7 значений])`. Это не протекает
в остальные страницы — они продолжают фильтровать `isArchived`/`status`
самостоятельно, никто из них не читает `funnelStage`. `won`/`lost` карточки
остаются видимыми на доске (это и есть весь смысл терминальных колонок в
kanban), с client-side ограничением «показывать только за последние 30
дней» для `won`/`lost` — иначе колонки бесконечно растут за месяцы работы.

## Global Constraints

- Спек: `docs/superpowers/specs/2026-08-13-leads-funnel-redesign.md` —
  источник истины, читать целиком перед началом.
- Нет test runner — верификация каждой задачи: `npm run build` + `npm run
  lint`, финальная задача добавляет полный ручной прогон в браузере
  (dev-сервер на localhost:5173).
- Новых npm-зависимостей не добавлять.
- Эскалация/напоминания — **только визуальные индикаторы** в приложении,
  без Cloud Functions и без Telegram — уже решено на этапе брейнсторминга.
- Каждый Firestore-документ при записи получает `updatedAt:
  serverTimestamp()`. Элементы массива (`stageHistory`, `callAttempts`) —
  `at`/`enteredAt: new Date()` (клиентское время) — `serverTimestamp()`
  внутри элемента массива не поддерживается Firestore, это не забытая
  оптимизация, а требование платформы (уже так сделано для
  `callAttempts` в `LeadsPage.jsx:97-98` из прошлой итерации).
- Права Firestore не меняются — `students`/`settings` уже пишутся/читаются
  `isAdmin()`, тот же набор ролей уже работает с «Заявками» и «Настройками».
  Трогать `firestore.rules` не нужно.
- Комментарии в коде — только где неочевидно ПОЧЕМУ.

---

### Task 1: Модель стадий + `leadFunnel.js`

**Files:**
- Modify: `src/components/leads/columns.js`
- Create: `src/lib/leadFunnel.js`

**Interfaces:**
- Produces: `COLUMNS` (переопределён — 7 стадий вместо 6 колонок),
  `columnKeyOf(lead)`, `isForwardAllowed(fromStage, toStage)` — из
  `columns.js`. `advanceStage(db, lead, newStage, extraFields, user)`,
  `slaDeadline(createdAt)`, `isPriorityLead(createdAt)`,
  `callScheduleHint(attempts)`, `assignRoundRobinOperator(db, branchId,
  operatorIds)`, `LOST_REASON_OPTIONS` — из `leadFunnel.js`. Все
  последующие задачи потребляют эти экспорты по именам, указанным здесь.

- [ ] **Step 1: Переписать `src/components/leads/columns.js`**

```js
// src/components/leads/columns.js
/**
 * 7 стадий воронки продаж (2026-08-13-leads-funnel-redesign.md). Порядок —
 * порядок колонок слева направо на доске «Заявки» и порядок разрешённых
 * переходов вперёд (нельзя двигать карточку назад по списку).
 */
export const COLUMNS = [
  { key: 'new', label: 'Новый лид' },
  { key: 'calling', label: 'Дозвон' },
  { key: 'trial_scheduled', label: 'Пробный назначен' },
  { key: 'trial_completed', label: 'Пробный проведён' },
  { key: 'closing', label: 'Дожим' },
  { key: 'won', label: 'Оплачено' },
  { key: 'lost', label: 'Отказ' },
];

const FORWARD_ORDER = COLUMNS.filter((c) => c.key !== 'lost').map((c) => c.key);

/**
 * Стадия, в которой сейчас находится лид. Дефолт 'new' — для лидов без
 * funnelStage (до миграции, см. scripts/backfill-funnel-stage.mjs) и для
 * newly-created документов до записи поля.
 * @param {Object} lead
 * @returns {string} один из ключей COLUMNS
 */
export function columnKeyOf(lead) {
  return COLUMNS.some((c) => c.key === lead.funnelStage) ? lead.funnelStage : 'new';
}

/**
 * Разрешён ли переход `from → to`: только вперёд по FORWARD_ORDER (можно
 * пропускать стадии), либо в 'lost' из любой нетерминальной стадии.
 * 'won'/'lost' — терминальные, из них переходов нет вовсе.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isForwardAllowed(from, to) {
  if (from === 'won' || from === 'lost') return false;
  if (to === 'lost') return true;
  const fromIndex = FORWARD_ORDER.indexOf(from);
  const toIndex = FORWARD_ORDER.indexOf(to);
  return toIndex > fromIndex;
}
```

- [ ] **Step 2: Создать `src/lib/leadFunnel.js`**

```js
// src/lib/leadFunnel.js
import { doc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';

/** Причины отказа — фиксированный список, свободный текст не допускается (см. спек §7). */
export const LOST_REASON_OPTIONS = [
  { value: 'expensive', label: 'Дорого' },
  { value: 'bad_timing', label: 'Не время' },
  { value: 'other_school', label: 'Выбрал другую школу' },
  { value: 'no_answer', label: 'Не дозвонились' },
  { value: 'no_show', label: 'Не пришёл на пробный' },
  { value: 'undecided', label: 'Думает' },
];

/**
 * Единая точка записи смены стадии — пишет `funnelStage`, дописывает
 * `stageHistory` (для отчёта по воронке, §10 спека) и `updatedAt`/
 * `updatedBy`. Все места, что меняют стадию лида, обязаны идти через эту
 * функцию, иначе `stageHistory` разойдётся с реальными переходами.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} lead текущий документ лида (нужен lead.stageHistory)
 * @param {string} newStage
 * @param {Object} extraFields доп. поля этого же updateDoc (например lostReason)
 * @param {{uid: string}} user
 */
export async function advanceStage(db, lead, newStage, extraFields, user) {
  await updateDoc(doc(db, 'students', lead.id), {
    funnelStage: newStage,
    stageHistory: [...(lead.stageHistory ?? []), { stage: newStage, enteredAt: new Date() }],
    ...extraFields,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

const WORKING_START_HOUR = 9;
const WORKING_END_HOUR = 18;

function isWithinWorkingHours(date) {
  return date.getDay() !== 0 && date.getHours() >= WORKING_START_HOUR && date.getHours() < WORKING_END_HOUR;
}

/** 9:00 следующего рабочего дня (пропускает воскресенье) относительно `date`. */
function nextWorkingStart(date) {
  const d = new Date(date);
  if (d.getHours() >= WORKING_END_HOUR || d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
    d.setHours(WORKING_START_HOUR, 0, 0, 0);
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  } else {
    d.setHours(WORKING_START_HOUR, 0, 0, 0);
  }
  return d;
}

/** Лид вне рабочих часов на момент создания — визуальная метка priority (спек §3). */
export function isPriorityLead(createdAt) {
  return !isWithinWorkingHours(createdAt);
}

/** Дедлайн SLA (15 минут в рабочее время, иначе — 15 минут от начала следующего рабочего дня). */
export function slaDeadline(createdAt) {
  const start = isWithinWorkingHours(createdAt) ? createdAt : nextWorkingStart(createdAt);
  return new Date(start.getTime() + 15 * 60_000);
}

/**
 * Подсказка расписания дозвона под точками попыток — чисто информационная
 * строка (2 сегодня / 2 завтра / 1 послезавтра из спека §4), без пуш-
 * напоминаний. `null`, если подсказывать нечего (0 попыток или лид уже
 * ушёл с этой стадии).
 * @param {Array<{result: 'success'|'fail'}>} attempts
 */
export function callScheduleHint(attempts) {
  const n = attempts.length;
  if (n === 0 || n >= 5) return null;
  if (n < 2) return 'Ещё сегодня';
  if (n < 4) return 'Завтра';
  return 'Послезавтра';
}

/**
 * Round-robin назначение оператора при создании лида. Список операторов
 * читается снаружи транзакции (обычный getDocs — сам список меняется
 * редко, 2-3 человека, гонка на устаревший список не критична), но счётчик
 * очереди — `settings/{branchId}.lastRoundRobinIndex` — читается и
 * пишется внутри `runTransaction`, чтобы два лида, созданных почти
 * одновременно, не получили одного и того же следующего оператора.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {Array<string>} operatorIds уже отсортированный список uid
 * @returns {Promise<string|null>} uid назначенного оператора, null если операторов нет
 */
export async function assignRoundRobinOperator(db, branchId, operatorIds) {
  if (operatorIds.length === 0) return null;
  const settingsRef = doc(db, 'settings', branchId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(settingsRef);
    const index = snap.data()?.lastRoundRobinIndex ?? 0;
    const operator = operatorIds[index % operatorIds.length];
    tx.set(settingsRef, { lastRoundRobinIndex: index + 1 }, { merge: true });
    return operator;
  });
}
```

- [ ] **Step 3: Собрать и проверить линт**

Run: `npm run build`
Expected: сборка проходит без ошибок (пока `LeadsPage.jsx`/`LeadCard.jsx`
ещё используют старые `STAGE_KEYS`/`leadStage`/`leadResult` — они сломаются
на следующем шаге, это ожидаемо и чинится в Task 2-4; на этом шаге просто
убедиться, что новые файлы сами по себе валидны).

Run: `npx eslint src/lib/leadFunnel.js src/components/leads/columns.js` (или
`npm run lint` целиком, если репозиторий уже в переходном состоянии —
допустимо получить ошибки в файлах, которые чинятся дальше по плану)
Expected: без предупреждений в этих двух файлах.

- [ ] **Step 4: Commit**

```bash
git add src/components/leads/columns.js src/lib/leadFunnel.js
git commit -m "Add 7-stage funnel model and leadFunnel helpers"
```

---

### Task 2: Round-robin при создании лида (`StudentFormModal.jsx`)

**Files:**
- Modify: `src/components/students/StudentFormModal.jsx`

**Interfaces:**
- Consumes: `assignRoundRobinOperator` из `src/lib/leadFunnel.js` (Task 1).
- Produces: новый лид создаётся с `funnelStage:'new'`, `assignedOperator`,
  `stageHistory:[{stage:'new', enteredAt}]` вместо `leadStage:'today',
  leadResult:null`. Task 4 (`LeadCard`/`LeadColumn`) читает
  `lead.assignedOperator` вместо `lead.createdBy` для тега оператора.

- [ ] **Step 1: Импорты**

В `src/components/students/StudentFormModal.jsx` добавить к существующему
импорту из `firebase/firestore`:

```js
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
```

(добавлены `getDocs`, `query`, `where` к уже импортированным `collection,
addDoc, updateDoc, doc, serverTimestamp`). Добавить новый импорт:

```js
import { assignRoundRobinOperator } from '../../lib/leadFunnel.js';
```

- [ ] **Step 2: Получить список операторов и назначить перед созданием**

В `handleSubmit`, в ветке создания (`else { const created = await addDoc(...) }`),
перед вызовом `addDoc` вставить:

```js
const operatorsSnap = await getDocs(
  query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId), where('role', 'in', ['ceo', 'manager', 'admin'])),
);
const operatorIds = operatorsSnap.docs.map((d) => d.id).sort();
const assignedOperator = await assignRoundRobinOperator(db, activeBranchId, operatorIds);
```

- [ ] **Step 3: Заменить поля лида в `addDoc`**

Заменить в объекте, переданном в `addDoc(collection(db, 'students'), {...})`:

```js
          leadStage: 'today',
          leadResult: null,
```

на:

```js
          funnelStage: 'new',
          assignedOperator,
          stageHistory: [{ stage: 'new', enteredAt: new Date() }],
```

- [ ] **Step 4: Собрать и проверить линт**

Run: `npm run build`
Expected: без ошибок в `StudentFormModal.jsx` (остальной репозиторий может
ещё падать до Task 3-4 — ожидаемо).

Run: `npm run lint`
Expected: без новых предупреждений в `src/components/students/
StudentFormModal.jsx`.

- [ ] **Step 5: Commit**

```bash
git add src/components/students/StudentFormModal.jsx
git commit -m "Assign lead operator via round robin on creation"
```

---

### Task 3: `LeadsPage.jsx` — доска на funnelStage

**Files:**
- Modify: `src/pages/LeadsPage.jsx`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: `advanceStage`, `isPriorityLead`, `slaDeadline` из
  `leadFunnel.js` (Task 1); `isForwardAllowed` из `columns.js` (Task 1).
- Produces: `cardActions.onMove` теперь проверяет `isForwardAllowed` и
  пишет через `advanceStage`; `cardActions.onMarkAttempt` авто-переводит
  `new→calling` и `→lost` на 5-й неудаче; доска больше не читает `status`/
  `isArchived` (см. «Важное архитектурное решение» выше) — читает
  `funnelStage in [...]`, с client-side фильтром «won/lost не старше 30
  дней». Task 4 полагается на то, что `LeadColumn`/`LeadCard` получают
  `cardActions` с той же сигнатурой, что и раньше, плюс не изменённый
  `onDropLead`.

- [ ] **Step 0: Добавить индекс доски в `firestore.indexes.json`**

Это самый важный индекс во всём плане — без него сама доска (запрос
`where(branchId)+where(funnelStage in [...])+orderBy(createdAt desc)` из
Step 1 ниже) падает с `FAILED_PRECONDITION`, и «Заявки» не открываются
вовсе. Добавить в массив `"indexes"`:

```json
    {
      "collectionGroup": "students",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "branchId", "order": "ASCENDING" },
        { "fieldPath": "funnelStage", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
```

- [ ] **Step 1: Заменить весь файл**

```jsx
// src/pages/LeadsPage.jsx
import { useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { CallLogModal } from '../components/students/CallLogModal.jsx';
import { TrialFormModal } from '../components/leads/TrialFormModal.jsx';
import { LeadColumn } from '../components/leads/LeadColumn.jsx';
import { COLUMNS, columnKeyOf, isForwardAllowed } from '../components/leads/columns.js';
import { advanceStage } from '../lib/leadFunnel.js';

const WON_LOST_VISIBLE_DAYS = 30;
const TERMINAL_STAGES = ['won', 'lost'];

/**
 * Заявки — 7-стадийная воронка продаж (2026-08-13-leads-funnel-redesign.md).
 * Перенос между стадиями — только вперёд (drag-n-drop или кнопка «→»),
 * кроме «Отказ» — туда можно с любой нетерминальной стадии. Клик по
 * карточке — на `/students/:id`.
 */
export function LeadsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const { user, staff } = useAuth();

  // Форс-перерисовка раз в минуту — иначе просроченный SLA-бейдж не
  // появится сам по себе (Firestore не «уведомляет» о течении времени).
  const [, forceTick] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(forceTick, 60_000);
    return () => clearInterval(id);
  }, []);

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('funnelStage', 'in', COLUMNS.map((c) => c.key)),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId],
  );
  const { data: allLeads } = useCollection(leadsQuery);

  // won/lost старше 30 дней не показываем на доске — иначе терминальные
  // колонки бесконечно растут за месяцы работы (см. план, «Важное
  // архитектурное решение»). Документ никуда не девается, просто не
  // рендерится в этом списке.
  const leads = useMemo(() => {
    const cutoff = Date.now() - WON_LOST_VISIBLE_DAYS * 86_400_000;
    return allLeads.filter((l) => {
      if (!TERMINAL_STAGES.includes(columnKeyOf(l))) return true;
      const at = (l.paidAt ?? l.lostAt ?? l.updatedAt)?.toDate?.();
      return at ? at.getTime() >= cutoff : true;
    });
  }, [allLeads]);

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);

  const operatorByUid = useMemo(() => {
    const map = new Map();
    for (const s of staffList) map.set(s.id, { color: s.color, name: s.fullName });
    return map;
  }, [staffList]);

  const [formLead, setFormLead] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [callTarget, setCallTarget] = useState(null);
  const [trialTarget, setTrialTarget] = useState(null); // { lead, mode: 'schedule'|'reschedule' }

  const byColumn = useMemo(() => {
    const map = {};
    for (const c of COLUMNS) map[c.key] = [];
    for (const lead of leads) map[columnKeyOf(lead)].push(lead);
    return map;
  }, [leads]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const patch = async (lead, data, okMessage) => {
    try {
      await updateDoc(doc(db, 'students', lead.id), { ...data, updatedAt: serverTimestamp() });
      if (okMessage) showToast(okMessage);
    } catch {
      showToast('Не удалось обновить лид.', { type: 'error' });
    }
  };

  const markAttempt = async (lead, result) => {
    const attempts = lead.callAttempts ?? [];
    if (attempts.length >= 5) return;
    const nextAttempts = [...attempts, { result, at: new Date() }];
    const isCold = nextAttempts.length === 5 && nextAttempts.every((a) => a.result === 'fail');
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'callLogs')), {
        studentId: lead.id,
        direction: 'out',
        result: result === 'success' ? 'reached' : 'no_answer',
        comment: '',
        durationSec: 0,
        quickMark: true,
        userId: user.uid,
        userName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      const stageFields = {};
      if (lead.funnelStage === 'new') {
        stageFields.funnelStage = 'calling';
        stageFields.stageHistory = [...(lead.stageHistory ?? []), { stage: 'calling', enteredAt: new Date() }];
      } else if (isCold) {
        stageFields.funnelStage = 'lost';
        stageFields.lostReason = 'no_answer';
        stageFields.lostAt = serverTimestamp();
        stageFields.stageHistory = [...(lead.stageHistory ?? []), { stage: 'lost', enteredAt: new Date() }];
      }
      // serverTimestamp() внутри элемента массива не поддерживается Firestore —
      // callAttempts.at/stageHistory.enteredAt используют клиентское время,
      // updatedAt/lostAt документа ниже — уже верхнеуровневые поля, им можно.
      batch.update(doc(db, 'students', lead.id), {
        callAttempts: nextAttempts,
        ...stageFields,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      if (stageFields.funnelStage === 'lost') showToast(`${lead.fullName}: 5 неудачных попыток, лид отмечен как отказ.`);
    } catch {
      showToast('Не удалось отметить попытку.', { type: 'error' });
    }
  };

  const moveLead = (lead, stageKey) => {
    if (columnKeyOf(lead) === stageKey) return;
    if (!isForwardAllowed(columnKeyOf(lead), stageKey)) {
      showToast('Нельзя вернуть лида на предыдущую стадию.', { type: 'error' });
      return;
    }
    if (stageKey === 'won' || stageKey === 'lost') return; // эти переходы — через оплату/DeclineLeadModal, не через drag
    advanceStage(db, lead, stageKey, {}, user).catch(() => showToast('Не удалось обновить лид.', { type: 'error' }));
  };

  const markTouch = (lead) => {
    const nextNumber = (lead.closingTouchNumber ?? 0) + 1;
    const daysToAdd = nextNumber === 1 ? 1 : 4;
    const nextTouchAt = nextNumber >= 3 ? null : new Date(Date.now() + daysToAdd * 86_400_000);
    patch(lead, { closingTouchNumber: nextNumber, nextTouchAt }, `Касание ${nextNumber} отмечено.`);
  };

  const openAddForm = () => {
    setPendingTarget(true);
    setFormLead({});
  };

  const handleCreated = () => {
    setPendingTarget(null);
    // новый лид уже создан с funnelStage:'new' в StudentFormModal — писать
    // здесь больше нечего, доска подхватит его через onSnapshot.
  };

  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onCall: (lead) => setCallTarget(lead),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onScheduleTrial: (lead) => setTrialTarget({ lead, mode: 'schedule' }),
    onRescheduleTrial: (lead) => setTrialTarget({ lead, mode: 'reschedule' }),
    onMarkAttended: (lead, engagementScore) =>
      advanceStage(db, lead, 'trial_completed', { attended: true, engagementScore }, user).catch(() =>
        showToast('Не удалось сохранить явку.', { type: 'error' }),
      ),
    onMarkTouch: markTouch,
    onMove: moveLead,
    onMarkAttempt: markAttempt,
  };

  return (
    <>
      <PageHeader
        title="Заявки"
        actions={
          <Button onClick={openAddForm}>
            <Plus className="h-4 w-4" /> Добавить лида
          </Button>
        }
      />
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((column) => (
          <LeadColumn
            key={column.key}
            column={column}
            leads={byColumn[column.key]}
            operatorByUid={operatorByUid}
            onAdd={column.key === 'new' ? openAddForm : undefined}
            onDropLead={(leadId, columnKey) => {
              const lead = leadsById.get(leadId);
              if (lead) moveLead(lead, columnKey);
            }}
            {...cardActions}
          />
        ))}
      </div>

      <StudentFormModal
        student={formLead}
        onClose={() => {
          setFormLead(null);
          setPendingTarget(null);
        }}
        onCreated={handleCreated}
      />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} />
      <CallLogModal open={Boolean(callTarget)} studentId={callTarget?.id} onClose={() => setCallTarget(null)} />
      <TrialFormModal target={trialTarget} onClose={() => setTrialTarget(null)} />
    </>
  );
}
```

Примечание: `openAddForm` больше не принимает `columnKey` — новый лид
всегда создаётся в `'new'` (round-robin из Task 2 уже это гарантирует), и
только колонка `'new'` показывает кнопку «+» в заголовке (остальные стадии
не создаются вручную «в обход» воронки). `TrialFormModal` и связанные
`onScheduleTrial`/`onRescheduleTrial`/`onMarkAttended`/`onMarkTouch` —
реализуются в Task 5-7, здесь только подключаются как потребители.

- [ ] **Step 2: Собрать и проверить линт**

Run: `npm run build`
Expected: сборка **упадёт** — `LeadColumn.jsx`/`LeadCard.jsx` (Task 4) и
`TrialFormModal.jsx` (Task 5) ещё не обновлены под новую сигнатуру
`cardActions`. Это ожидаемо на данном шаге плана — зафиксировать в отчёте,
что ошибки ограничены отсутствующими экспортами/пропами из следующих
задач, без сюрпризов в самом `LeadsPage.jsx`.

- [ ] **Step 3: Задеплоить индекс**

Run: `npx firebase-tools deploy --only firestore:indexes` (или консолью
Firebase — зафиксировать способ в отчёте). Билд на этом шаге всё ещё
падает (Task 4/5 не готовы) — индекс задеплоить можно и нужно уже сейчас,
это не зависит от остального кода.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LeadsPage.jsx firestore.indexes.json
git commit -m "Rewrite LeadsPage around funnelStage: forward-only moves, auto-transitions, 30-day terminal window"
```

---

### Task 4: `LeadCard.jsx` + `LeadColumn.jsx` — визуал воронки

**Files:**
- Modify: `src/components/leads/LeadCard.jsx`
- Modify: `src/components/leads/LeadColumn.jsx`

**Interfaces:**
- Consumes: `isPriorityLead`, `slaDeadline`, `callScheduleHint` из
  `leadFunnel.js`; `isForwardAllowed`, `COLUMNS` из `columns.js`; новые
  пропы из `LeadsPage.jsx` (`onScheduleTrial`, `onRescheduleTrial`,
  `onMarkAttended`, `onMarkTouch`).
- Produces: карточка читает `lead.assignedOperator` (не `createdBy`) для
  тега оператора — `LeadColumn.jsx` меняет ключ поиска в `operatorByUid`.

- [ ] **Step 1: `LeadColumn.jsx` — один символ меняется**

В `src/components/leads/LeadColumn.jsx` заменить:

```js
            const op = operatorByUid.get(lead.createdBy);
```

на:

```js
            const op = operatorByUid.get(lead.assignedOperator);
```

Также сделать колонку `'new'` единственной с кнопкой «+»: заменить сигнатуру
`onAdd` на опциональную (уже передаётся `undefined` для остальных колонок из
Task 3) — в JSX заголовка:

```jsx
        <span className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-muted">{leads.length}</span>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Добавить лида: ${column.label}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </span>
```

- [ ] **Step 2: Заменить весь `LeadCard.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight, AlertTriangle } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS, isForwardAllowed } from './columns.js';
import { isPriorityLead, slaDeadline, callScheduleHint, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDate, formatDateTime } from '../../lib/format.js';

const STATUS_BADGE = {
  lead: { variant: 'type-system', label: 'Лид' },
  trial: { variant: 'status-active', label: 'Пробный' },
};

const ENGAGEMENT_OPTIONS = [
  { value: 'low', label: 'Низкая' },
  { value: 'medium', label: 'Средняя' },
  { value: 'high', label: 'Высокая' },
];

const MAX_ATTEMPTS = 5;

/** Ряд из 5 точек — попытки дозвона, см. 2026-08-12-lead-card-call-attempts-design.md. */
function CallAttemptDots({ attempts, onMark }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isCold = attempts.length === MAX_ATTEMPTS && attempts.every((a) => a.result === 'fail');
  const hint = callScheduleHint(attempts);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
          const attempt = attempts[i];
          if (attempt) {
            const Icon = attempt.result === 'success' ? CheckCircle2 : XCircle;
            return <Icon key={i} className={`h-4 w-4 ${attempt.result === 'success' ? 'text-success' : 'text-danger'}`} />;
          }
          if (i === attempts.length) {
            return (
              <div key={i} ref={ref} className="relative">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen((v) => !v)}
                  aria-label={`Попытка ${i + 1}: отметить результат звонка`}
                  className="flex h-4 w-4 items-center justify-center text-border hover:text-navy disabled:opacity-50"
                >
                  <Circle className="h-4 w-4" />
                </button>
                {open && (
                  <div className="absolute left-1/2 top-6 z-10 w-40 -translate-x-1/2 rounded-field border border-border bg-surface py-1 shadow-hover">
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        setPending(true);
                        await onMark('success');
                        setPending(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-surface-alt"
                    >
                      ✓ Успешно
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        setPending(true);
                        await onMark('fail');
                        setPending(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-danger hover:bg-surface-alt"
                    >
                      ✕ Не успешно
                    </button>
                  </div>
                )}
              </div>
            );
          }
          return <Circle key={i} className="h-4 w-4 text-border" />;
        })}
      </div>
      {isCold && (
        <span title="Холодный лид: 5 неудачных попыток дозвона" className="flex items-center">
          <Snowflake className="h-4 w-4 text-danger" />
        </span>
      )}
      {!isCold && hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

/** Попап выбора вовлечённости после отметки явки на пробный — см. Task 6 брифа. */
function EngagementPopover({ onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-field border border-border px-2 py-1 text-[12px] font-bold text-text hover:bg-surface-alt"
      >
        Пришёл
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-10 w-40 rounded-field border border-border bg-surface py-1 shadow-hover">
          {ENGAGEMENT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(o.value);
              }}
              className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-surface-alt"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Карточка лида на 7-стадийной воронке «Заявки» (2026-08-13-leads-funnel-
 * redesign.md). Перетаскивается мышью (native HTML5 DnD) только вперёд по
 * стадиям — терминальные (won/lost) не draggable вовсе.
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor] hex-цвет назначенного оператора (`staff.color`)
 * @param {string} [props.operatorName] имя назначенного оператора
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCall открывает полную форму записи звонка
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onScheduleTrial
 * @param {(lead: Object) => void} props.onRescheduleTrial
 * @param {(lead: Object, engagementScore: 'low'|'medium'|'high') => void} props.onMarkAttended
 * @param {(lead: Object) => void} props.onMarkTouch
 * @param {(lead: Object, stageKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt
 */
export function LeadCard({
  lead,
  operatorColor,
  operatorName,
  onOpen,
  onCall,
  onEdit,
  onDecline,
  onScheduleTrial,
  onRescheduleTrial,
  onMarkAttended,
  onMarkTouch,
  onMove,
  onMarkAttempt,
}) {
  const stage = lead.funnelStage ?? 'new';
  const isTerminal = stage === 'won' || stage === 'lost';
  const attempts = lead.callAttempts ?? [];
  const operatorLabel = (operatorName ?? '').split(' ')[0];

  const createdAt = lead.createdAt?.toDate?.();
  const overdue = stage === 'new' && createdAt ? Date.now() > slaDeadline(createdAt).getTime() : false;
  const priority = createdAt ? isPriorityLead(createdAt) : false;

  const menuItems = [
    ...(stage === 'new' || stage === 'calling' ? [{ label: 'Записать на пробный', onClick: () => onScheduleTrial(lead) }] : []),
    { label: 'Записать звонок', onClick: () => onCall(lead) },
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    ...(!isTerminal ? [{ label: 'Отказ', danger: true, onClick: () => onDecline(lead) }] : []),
  ];

  const moveItems = COLUMNS.filter((c) => isForwardAllowed(stage, c.key) && c.key !== 'lost').map((c) => ({
    label: c.label,
    onClick: () => onMove(lead, c.key),
  }));

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!isTerminal}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className={`group flex flex-col gap-1.5 rounded-xl border bg-surface p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isTerminal ? 'cursor-pointer border-border' : 'cursor-grab border-border hover:border-navy/20 active:cursor-grabbing'
      } ${overdue ? 'border-danger ring-1 ring-danger/40' : ''} ${priority && !overdue ? 'border-l-4 border-l-orange-soft' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
        <div className="flex shrink-0 items-center gap-1">
          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-label="Просрочен ответ по SLA" />}
          <Badge variant={STATUS_BADGE[lead.status]?.variant ?? 'type-system'} className="!px-1.5 !py-0 !text-[10px]">
            {STATUS_BADGE[lead.status]?.label ?? lead.status}
          </Badge>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        {operatorLabel ? (
          <span
            className="inline-flex w-fit items-center truncate rounded-badge px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: operatorColor || '#8B94A3' }}
          >
            {operatorLabel}
          </span>
        ) : (
          <span />
        )}
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>

      {(stage === 'new' || stage === 'calling') && (
        <div onClick={(e) => e.stopPropagation()}>
          <CallAttemptDots attempts={attempts} onMark={(result) => onMarkAttempt(lead, result)} />
        </div>
      )}

      {stage === 'trial_scheduled' && (
        <div className="flex items-center justify-between gap-2 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-muted">{lead.trialDate ? formatDateTime(lead.trialDate) : 'Дата не указана'}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onRescheduleTrial(lead)}
              className="rounded-field border border-border px-2 py-1 text-[12px] text-muted hover:bg-surface-alt"
            >
              Не пришёл
            </button>
            <EngagementPopover onPick={(score) => onMarkAttended(lead, score)} />
          </div>
        </div>
      )}

      {stage === 'closing' && (
        <div className="flex items-center justify-between gap-2 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <span className="text-muted">Касание {lead.closingTouchNumber ?? 0}/3</span>
          {(lead.closingTouchNumber ?? 0) < 3 && (
            <button
              type="button"
              onClick={() => onMarkTouch(lead)}
              className="rounded-field border border-border px-2 py-1 text-[12px] font-bold text-text hover:bg-surface-alt"
            >
              Отметить касание
            </button>
          )}
        </div>
      )}

      {stage === 'lost' && lead.lostReason && (
        <p className="text-[12px] text-danger">
          Причина: {LOST_REASON_OPTIONS.find((o) => o.value === lead.lostReason)?.label ?? lead.lostReason}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[12px] text-muted">{formatDate(lead.createdAt)}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {!isTerminal && moveItems.length > 0 && <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />}
          <DropdownMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}
```

Примечание: `formatDateTime` уже существует и используется в
`CallLogsTab.jsx` (`../../lib/format.js`) — переиспользуется здесь для
даты пробного, новой функции форматирования писать не нужно.

- [ ] **Step 3: Собрать и проверить линт**

Run: `npm run build`
Expected: сборка всё ещё падает на отсутствующем `TrialFormModal.jsx`
(импортируется в `LeadsPage.jsx` из Task 3) — это чинится в Task 5.
Убедиться, что ошибка теперь только в этом одном месте, не в `LeadCard.jsx`/
`LeadColumn.jsx`.

Run: `npm run lint`
Expected: без новых предупреждений в изменённых файлах.

- [ ] **Step 4: Commit**

```bash
git add src/components/leads/LeadCard.jsx src/components/leads/LeadColumn.jsx
git commit -m "LeadCard: SLA/priority badges, forward-only move menu, stage-specific actions"
```

---

### Task 5: `TrialFormModal.jsx` — назначение/перенос пробного

**Files:**
- Create: `src/components/leads/TrialFormModal.jsx`

**Interfaces:**
- Consumes: `advanceStage` из `leadFunnel.js`; `target: {lead, mode:
  'schedule'|'reschedule'} | null` и `onClose` из `LeadsPage.jsx` (Task 3
  уже рендерит `<TrialFormModal target={trialTarget} onClose={...} />`).
- Produces: ничего для других файлов — терминальный потребитель цепочки
  `onScheduleTrial`/`onRescheduleTrial` из `LeadCard.jsx`.

- [ ] **Step 1: Создать файл**

```jsx
// src/components/leads/TrialFormModal.jsx
import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Назначение или перенос даты пробного урока (2026-08-13-leads-funnel-
 * redesign.md §5). `mode: 'schedule'` — первое назначение, переводит лида
 * в `trial_scheduled` через `advanceStage`. `mode: 'reschedule'` — «Не
 * пришёл»: та же форма, но стадия не меняется (лид остаётся в
 * `trial_scheduled`), только новая дата и `rescheduleCount += 1`.
 * @param {Object} props
 * @param {{lead: Object, mode: 'schedule'|'reschedule'}|null} props.target
 * @param {() => void} props.onClose
 */
export function TrialFormModal({ target, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('12:00');
  const [teacherId, setTeacherId] = useState('');
  const [saving, setSaving] = useState(false);

  const teachersQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'teachers'), where('branchIds', 'array-contains', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId],
  );
  const { data: teachers } = useCollection(teachersQuery);

  useEffect(() => {
    if (!target) return;
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime('12:00');
    setTeacherId(target.lead.trialTeacherId ?? '');
  }, [target]);

  if (!target) return null;
  const { lead, mode } = target;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trialDate = Timestamp.fromDate(new Date(`${date}T${time}:00`));
      if (mode === 'schedule') {
        await advanceStage(db, lead, 'trial_scheduled', {
          status: 'trial',
          trialAt: serverTimestamp(),
          trialDate,
          trialTeacherId: teacherId || null,
        }, user);
        showToast(`${lead.fullName}: пробный назначен.`);
      } else {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'students', lead.id), {
          trialDate,
          trialTeacherId: teacherId || null,
          rescheduleCount: (lead.rescheduleCount ?? 0) + 1,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        showToast(`${lead.fullName}: пробный перенесён.`);
      }
      onClose();
    } catch {
      showToast('Не удалось сохранить дату пробного.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={mode === 'schedule' ? `Пробный: ${lead.fullName}` : `Перенос пробного: ${lead.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Время" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        <Select
          label="Учитель"
          options={[{ value: '', label: 'Не выбран' }, ...teachers.map((t) => ({ value: t.id, label: t.displayName }))]}
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
        />
      </form>
    </Modal>
  );
}
```

Примечание: динамический `await import('firebase/firestore')` внутри
`reschedule`-ветки — сознательный выбор, чтобы не тащить `updateDoc`/`doc`
в статический импорт файла только ради одной ветки; если ревьюер сочтёт
это избыточным усложнением — поднять `updateDoc, doc` в обычный
статический импорт наверху файла (эквивалентно по поведению, чуть проще
читать, единственный минус — импорт есть, даже когда используется только
в одной из двух веток формы). Тривиальная правка либо в эту, либо в ту
сторону не блокирует ревью.

- [ ] **Step 2: Собрать и проверить линт**

Run: `npm run build`
Expected: сборка проходит **без ошибок** — это последний файл, которого не
хватало `LeadsPage.jsx` из Task 3.

Run: `npm run lint`
Expected: без предупреждений в `src/components/leads/TrialFormModal.jsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/TrialFormModal.jsx
git commit -m "Add TrialFormModal: schedule and reschedule trial lessons"
```

---

### Task 6: `DeclineLeadModal.jsx` — фиксированные причины отказа

**Files:**
- Modify: `src/components/students/DeclineLeadModal.jsx`

**Interfaces:**
- Consumes: `LOST_REASON_OPTIONS`, `advanceStage` из `leadFunnel.js`.
- Produces: отказ лида пишет `funnelStage:'lost'`, `lostReason` (из
  фиксированного списка), `lostAt` — доска (Task 3) уже готова показать
  такую карточку в колонке «Отказ» (не фильтрует `isArchived`).

- [ ] **Step 1: Заменить весь файл**

```jsx
import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';

/**
 * «Отказ» лида — причина строго из фиксированного списка
 * (2026-08-13-leads-funnel-redesign.md §7), свободный текст не допускается.
 * `lead` = null (закрыто) или сущность.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function DeclineLeadModal({ lead, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState(LOST_REASON_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await advanceStage(
        db,
        lead,
        'lost',
        {
          status: 'archived',
          statusReason: LOST_REASON_OPTIONS.find((o) => o.value === reason)?.label ?? reason,
          lostReason: reason,
          lostAt: serverTimestamp(),
          isArchived: true,
          archivedAt: serverTimestamp(),
        },
        user,
      );
      showToast('Лид отклонён.');
      setReason(LOST_REASON_OPTIONS[0].value);
      onClose();
    } catch {
      showToast('Не удалось сохранить отказ.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(lead)}
      onClose={onClose}
      title={`Отказ: ${lead?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving}>
            Отказать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Select label="Причина" required options={LOST_REASON_OPTIONS} value={reason} onChange={(e) => setReason(e.target.value)} />
      </form>
    </Modal>
  );
}
```

Примечание: `advanceStage` ожидает `lead.stageHistory` — вызывается здесь
с полным `lead` объектом, переданным из `LeadsPage.jsx` (`declineTarget`),
у которого это поле уже есть из Firestore-подписки. `updateDoc` внутри
`advanceStage` уже проставляет `updatedAt`/`updatedBy` сам — здесь их
задавать не нужно (раньше `DeclineLeadModal` делал это вручную, теперь
через общий хелпер).

- [ ] **Step 2: Собрать и проверить линт**

Run: `npm run build`
Expected: без ошибок.

Run: `npm run lint`
Expected: без предупреждений в `src/components/students/DeclineLeadModal.jsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/students/DeclineLeadModal.jsx
git commit -m "DeclineLeadModal: fixed lostReason list instead of free text"
```

---

### Task 7: Оплата → `won`

**Files:**
- Modify: `src/lib/billing.js`

**Interfaces:**
- Consumes: ничего нового — использует уже существующий `updateDoc`/
  `serverTimestamp` (уже импортированы в файле).
- Produces: первый платёж лида в `trial_completed`/`closing` переводит его
  в `funnelStage:'won'` — доска (Task 3) уже готова это показать.

- [ ] **Step 1: Расширить блок первого платежа в `recordPayment`**

В `src/lib/billing.js`, найти (строки 280-282 в текущей версии):

```js
  if (!student.firstPaymentAt) {
    await updateDoc(doc(db, 'students', student.id), { firstPaymentAt: serverTimestamp() });
  }
  return txId;
```

Заменить на:

```js
  if (!student.firstPaymentAt) {
    const wonFields = ['trial_completed', 'closing'].includes(student.funnelStage)
      ? {
          funnelStage: 'won',
          stageHistory: [...(student.stageHistory ?? []), { stage: 'won', enteredAt: new Date() }],
          paidAt: serverTimestamp(),
          paidAmount: amount,
          groupId: groupId ?? null,
        }
      : {};
    await updateDoc(doc(db, 'students', student.id), { firstPaymentAt: serverTimestamp(), ...wonFields });
  }
  return txId;
```

- [ ] **Step 2: Собрать и проверить линт**

Run: `npm run build`
Expected: без ошибок.

Run: `npm run lint`
Expected: без новых предупреждений в `src/lib/billing.js`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/billing.js
git commit -m "First payment auto-advances lead to funnelStage:won"
```

---

### Task 8: Отчёт «Воронка по операторам»

**Files:**
- Modify: `src/lib/reports.js`
- Modify: `src/pages/ReportsPage.jsx`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Produces: `funnelByOperator(db, branchId, periodStart, periodEnd)` в
  `reports.js` — новый экспорт, потребляется только внутри `ReportsPage.jsx`
  (Task 9 «Ремаркетинг» — отдельная функция, не эта).

- [ ] **Step 1: Добавить индекс в `firestore.indexes.json`**

В массив `"indexes"` файла `firestore.indexes.json` добавить (после
существующей записи `collectionGroup: "students"` с полями `branchId,
isArchived, status, createdAt`):

```json
    {
      "collectionGroup": "students",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "branchId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "ASCENDING" }
      ]
    },
```

Этот индекс нужен и новой функции ниже, и уже существующей
`conversionFunnel` (`src/lib/reports.js:129-143`), у которой такого же
запроса — `where(branchId)+where(createdAt>=)+where(createdAt<=)` — до сих
пор не было своего индекса.

- [ ] **Step 2: Добавить `funnelByOperator` в `src/lib/reports.js`**

В конец файла `src/lib/reports.js` добавить:

```js
/**
 * Воронка по операторам за период (2026-08-13-leads-funnel-redesign.md
 * §10): по каждому `assignedOperator` — новых лидов, % дозвона (хотя бы
 * одна запись 'calling' в stageHistory), % записи на пробный, % явки,
 * % оплаты после пробного, доля no_answer+no_show среди всех lost этого
 * оператора (индикатор проблемы с номерами/каналом, не со скриптом/ценой).
 */
export async function funnelByOperator(db, branchId, periodStart, periodEnd) {
  // funnelStage не фильтруется в самом запросе: Firestore не разрешает
  // inequality-фильтр (funnelStage != null) на одном поле вместе с
  // range-фильтром (createdAt >=/<=) на другом без специального
  // multi-inequality индекса — проще и надёжнее отсеять на клиенте.
  const snap = await getDocs(
    query(
      collection(db, 'students'),
      where('branchId', '==', branchId),
      where('createdAt', '>=', Timestamp.fromDate(periodStart)),
      where('createdAt', '<=', Timestamp.fromDate(periodEnd)),
    ),
  );
  const leads = snap.docs.map((d) => d.data()).filter((s) => Boolean(s.funnelStage));

  const byOperator = new Map();
  for (const lead of leads) {
    const opId = lead.assignedOperator ?? 'unassigned';
    if (!byOperator.has(opId)) byOperator.set(opId, []);
    byOperator.get(opId).push(lead);
  }

  const hasStage = (lead, stage) => (lead.stageHistory ?? []).some((h) => h.stage === stage);

  return [...byOperator.entries()].map(([operatorId, opLeads]) => {
    const total = opLeads.length;
    const dozvon = opLeads.filter((l) => hasStage(l, 'calling')).length;
    const trialScheduled = opLeads.filter((l) => hasStage(l, 'trial_scheduled')).length;
    const attended = opLeads.filter((l) => l.attended === true).length;
    const won = opLeads.filter((l) => l.funnelStage === 'won').length;
    const lost = opLeads.filter((l) => l.funnelStage === 'lost');
    const noAnswerOrNoShow = lost.filter((l) => l.lostReason === 'no_answer' || l.lostReason === 'no_show').length;
    return {
      operatorId,
      total,
      dozvonRate: total > 0 ? Math.round((dozvon / total) * 100) : 0,
      trialScheduledRate: total > 0 ? Math.round((trialScheduled / total) * 100) : 0,
      attendedRate: total > 0 ? Math.round((attended / total) * 100) : 0,
      wonRate: total > 0 ? Math.round((won / total) * 100) : 0,
      noAnswerShare: lost.length > 0 ? Math.round((noAnswerOrNoShow / lost.length) * 100) : 0,
      lostCount: lost.length,
    };
  });
}
```

Примечание: фильтр по `funnelStage` — на клиенте (см. комментарий в коде
выше), не в запросе — исключает студентов без этого поля (обычные
активные/платящие студенты, никогда не бывшие лидами в новой схеме).

- [ ] **Step 3: Добавить импорт и новую вкладку в `ReportsPage.jsx`**

В `src/pages/ReportsPage.jsx`:

Заменить импорт:

```js
import { revenueByCourse, revenueByTeacher, attendanceByGroup, churnReport, conversionFunnel, debtAging } from '../lib/reports.js';
```

на:

```js
import { revenueByCourse, revenueByTeacher, attendanceByGroup, churnReport, conversionFunnel, debtAging, funnelByOperator } from '../lib/reports.js';
```

Добавить в конец `staffQuery`-подобное чтение операторов (для подписи uid →
имя в таблице) — после существующего `const { activeBranchId } =
useBranch();`:

```js
  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const operatorName = (uid) => (uid === 'unassigned' ? 'Без оператора' : staffList.find((s) => s.id === uid)?.fullName ?? uid);
```

Добавить импорты `collection, query, where` из `firebase/firestore` и
`useCollection` из `../hooks/useCollection.js` в шапку файла (`query`,
`where`, `collection` там ещё не импортированы — сейчас файл использует
только `db` напрямую в вызовах `lib/reports.js`/`lib/stats.js`).

Добавить в массив `TABS`:

```js
  { key: 'funnel', label: 'Воронка по операторам' },
```

Добавить состояние и загрузку — в `useState`-блок:

```js
  const [funnelByOp, setFunnelByOp] = useState([]);
```

В `useEffect`, в цепочку `if/else if`, добавить ветку:

```js
      } else if (tab === 'funnel') {
        const data = await funnelByOperator(db, activeBranchId, fromDate, toDate);
        if (!cancelled) setFunnelByOp(data);
```

Добавить рендер таблицы — в JSX, рядом с блоком `tab === 'conversion'`:

```jsx
          {!loading && tab === 'funnel' && (
            funnelByOp.length === 0 ? (
              <EmptyState icon={BarChart3} title="Нет лидов за период" />
            ) : (
              <Table
                columns={[
                  { key: 'operator', label: 'Оператор', render: (r) => operatorName(r.operatorId) },
                  { key: 'total', label: 'Новых лидов' },
                  { key: 'dozvonRate', label: '% дозвона', render: (r) => `${r.dozvonRate}%` },
                  { key: 'trialScheduledRate', label: '% на пробный', render: (r) => `${r.trialScheduledRate}%` },
                  { key: 'attendedRate', label: '% явки', render: (r) => `${r.attendedRate}%` },
                  { key: 'wonRate', label: '% оплаты', render: (r) => `${r.wonRate}%` },
                  { key: 'noAnswerShare', label: 'Доля no_answer/no_show в отказах', render: (r) => `${r.noAnswerShare}%` },
                ]}
                rows={funnelByOp.map((r) => ({ id: r.operatorId, ...r }))}
              />
            )
          )}
```

- [ ] **Step 4: Собрать и проверить линт**

Run: `npm run build`
Expected: без ошибок.

Run: `npm run lint`
Expected: без новых предупреждений в `src/lib/reports.js`, `src/pages/
ReportsPage.jsx`.

- [ ] **Step 5: Задеплоить индекс**

Run: `npx firebase-tools deploy --only firestore:indexes` (или через
консоль Firebase, если CLI не настроен в этом окружении — зафиксировать в
отчёте, каким способом индекс был применён; без него вкладка «Воронка по
операторам» и (давно уже) «Конверсия» будут падать с ошибкой
`FAILED_PRECONDITION` в браузере).

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports.js src/pages/ReportsPage.jsx firestore.indexes.json
git commit -m "Add funnel-by-operator report tab"
```

---

### Task 9: Ремаркетинг — список отказов старше 30 дней

**Files:**
- Modify: `src/lib/reports.js`
- Modify: `src/pages/ReportsPage.jsx`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Produces: `remarketingCandidates(db, branchId)` в `reports.js` — читает
  напрямую (не завязано на выбранный период `from`/`to` — ремаркетинг
  всегда «прямо сейчас», без диапазона).

- [ ] **Step 0: Добавить индекс в `firestore.indexes.json`**

Запрос ниже (`branchId ==` + `funnelStage ==` + `lostReason in`, без
orderBy) — 3 фильтра на разных полях, нужен составной индекс. Добавить в
массив `"indexes"`:

```json
    {
      "collectionGroup": "students",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "branchId", "order": "ASCENDING" },
        { "fieldPath": "funnelStage", "order": "ASCENDING" },
        { "fieldPath": "lostReason", "order": "ASCENDING" }
      ]
    },
```

Примечание к адаптации спека: спек предполагал интеграцию в
`StudentsPage.jsx` по аналогии с «Покинувшими» — при ближайшем чтении
`StudentsPage.jsx` этот файл оказался плотно завязан на собственную
систему `?section=` с большим количеством взаимозависимого стейта.
Отдельная вкладка на `/reports` (тот же файл и паттерн, что уже
используется для остальных 8 отчётов, включая только что добавленную
«Воронку по операторам») — эквивалентна по функциональности, но не тянет
изменений в самый сложный файл проекта. Если впоследствии понадобится
именно на `StudentsPage.jsx` — отдельная итерация.

- [ ] **Step 1: Добавить `remarketingCandidates` в `src/lib/reports.js`**

В конец файла добавить:

```js
/**
 * Отказы, доступные для повторного маркетинга: `lostReason` — no_answer
 * или no_show (не смогли связаться, а не явный отказ), прошло ≥30 дней с
 * `lostAt` (2026-08-13-leads-funnel-redesign.md §7).
 */
export async function remarketingCandidates(db, branchId, today = new Date()) {
  const snap = await getDocs(
    query(collection(db, 'students'), where('branchId', '==', branchId), where('funnelStage', '==', 'lost'), where('lostReason', 'in', ['no_answer', 'no_show'])),
  );
  const cutoff = today.getTime() - 30 * 86_400_000;
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((s) => s.lostAt && s.lostAt.toDate().getTime() <= cutoff)
    .map((s) => ({ studentId: s.id, studentName: s.fullName, phone: s.phone, lostReason: s.lostReason, lostAt: s.lostAt.toDate() }))
    .sort((a, b) => b.lostAt - a.lostAt);
}
```

- [ ] **Step 2: Добавить вкладку в `ReportsPage.jsx`**

Добавить импорт `remarketingCandidates` в существующую строку импорта из
`../lib/reports.js` (Task 8 уже добавила `funnelByOperator` туда же).

Добавить в `TABS`:

```js
  { key: 'remarketing', label: 'Ремаркетинг' },
```

Добавить состояние:

```js
  const [remarketing, setRemarketing] = useState([]);
```

В `useEffect`, добавить ветку (не зависит от `fromDate`/`toDate`, читает
всегда «на сейчас»):

```js
      } else if (tab === 'remarketing') {
        const data = await remarketingCandidates(db, activeBranchId);
        if (!cancelled) setRemarketing(data);
```

Скрыть общие `DatePicker` «От»/«До» для этой вкладки — в блоке дат
заменить условие:

```jsx
          {tab !== 'attendance' && (
```

на:

```jsx
          {tab !== 'attendance' && tab !== 'remarketing' && (
```

Добавить рендер:

```jsx
          {!loading && tab === 'remarketing' && (
            remarketing.length === 0 ? (
              <EmptyState icon={BarChart3} title="Нет отказов старше 30 дней с причиной no_answer/no_show" />
            ) : (
              <Table
                columns={[
                  { key: 'studentName', label: 'Имя' },
                  { key: 'phone', label: 'Телефон', render: (r) => formatPhone(r.phone) },
                  { key: 'lostReason', label: 'Причина', render: (r) => (r.lostReason === 'no_answer' ? 'Не дозвонились' : 'Не пришёл на пробный') },
                  { key: 'lostAt', label: 'Дата отказа', render: (r) => fmtDate(r.lostAt) },
                ]}
                rows={remarketing.map((r) => ({ id: r.studentId, ...r }))}
              />
            )
          )}
```

Добавить импорт `formatPhone` в `../lib/format.js`-импорт файла (сейчас там
только `formatMoney`).

- [ ] **Step 3: Собрать и проверить линт**

Run: `npm run build`
Expected: без ошибок.

Run: `npm run lint`
Expected: без новых предупреждений.

- [ ] **Step 4: Задеплоить индекс**

Run: `npx firebase-tools deploy --only firestore:indexes` (или консолью
Firebase — зафиксировать способ в отчёте; без индекса вкладка
«Ремаркетинг» падает с `FAILED_PRECONDITION`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports.js src/pages/ReportsPage.jsx firestore.indexes.json
git commit -m "Add remarketing candidates tab (lost 30+ days ago, no_answer/no_show)"
```

---

### Task 10: Миграция существующих лидов

**Files:**
- Create: `scripts/backfill-funnel-stage.mjs`

**Interfaces:**
- Не потребляется другими файлами — одноразовый скрипт, запускается вручную
  перед вводом изменений в эксплуатацию, удаляется после успешного прогона
  (тот же паттерн, что `scripts/import-old-attendance-jul-aug.mjs`).

- [ ] **Step 1: Создать скрипт**

Использует тот же клиентский Firebase SDK + вход админом по `.env`, что и
`scripts/import-old-attendance-jul-aug.mjs` (`initializeApp` из
`firebase/app`, `signInWithEmailAndPassword`, обычные `firebase/firestore`
клиентские вызовы) — **не** `firebase-admin`/service account, которых в
этом проекте нет:

```js
// scripts/backfill-funnel-stage.mjs
// Одноразовый бэкфилл funnelStage/assignedOperator для лидов, заведённых
// до 2026-08-13-leads-funnel-redesign.md.
//
//   node --env-file=.env scripts/backfill-funnel-stage.mjs           # dry-run
//   node --env-file=.env scripts/backfill-funnel-stage.mjs --apply
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID, storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID, appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

function mapStage(student) {
  if (student.status === 'trial') return 'trial_scheduled';
  const hasAttempts = Array.isArray(student.callAttempts) && student.callAttempts.length > 0;
  return hasAttempts ? 'calling' : 'new';
}

async function main() {
  const snap = await getDocs(
    query(collection(db, 'students'), where('isArchived', '==', false), where('status', 'in', ['lead', 'trial'])),
  );
  console.log(`Найдено ${snap.size} лидов/пробных без funnelStage-миграции.`);

  let planned = 0;
  const batchSize = 400;
  let batch = writeBatch(db);
  let inBatch = 0;

  for (const docSnap of snap.docs) {
    const student = docSnap.data();
    if (student.funnelStage) continue; // уже мигрирован — повторный прогон безопасен
    const funnelStage = mapStage(student);
    const assignedOperator = student.assignedOperator ?? student.createdBy ?? null;
    planned += 1;
    console.log(`${student.fullName} (${docSnap.id}): status=${student.status} → funnelStage=${funnelStage}, assignedOperator=${assignedOperator}`);
    if (APPLY) {
      batch.update(doc(db, 'students', docSnap.id), {
        funnelStage,
        assignedOperator,
        stageHistory: [{ stage: funnelStage, enteredAt: new Date() }],
        rescheduleCount: student.rescheduleCount ?? 0,
        closingTouchNumber: student.closingTouchNumber ?? 0,
      });
      inBatch += 1;
      if (inBatch >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        inBatch = 0;
      }
    }
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(APPLY ? `Применено: ${planned} документов.` : `Dry-run: ${planned} документов будут изменены. Запустите с --apply, чтобы закоммитить.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit(0));
```

- [ ] **Step 2: Прогнать dry-run, проверить вывод**

Run: `node --env-file=.env scripts/backfill-funnel-stage.mjs`
Expected: список всех существующих лидов/пробных с планируемым
`funnelStage`, без реальной записи. Проверить на глаз, что маппинг
разумный (лиды с историей звонков → `calling`, без — `new`, все `trial` →
`trial_scheduled`).

- [ ] **Step 3: Применить**

Run: `node --env-file=.env scripts/backfill-funnel-stage.mjs --apply`
Expected: `Применено: N документов.` — после этого существующие лиды
появляются на новой доске в правильных колонках.

- [ ] **Step 4: Удалить скрипт (одноразовый, как остальные миграции в scripts/)**

```bash
rm scripts/backfill-funnel-stage.mjs
git add -A
git commit -m "Run one-off funnelStage backfill for existing leads"
```

(Коммит фиксирует удаление скрипта — сам факт миграции уже отражён в
изменённых документах Firestore, не в git.)

---

### Task 11: Полная ручная проверка

**Files:** нет — только верификация всех предыдущих задач вместе.

- [ ] **Step 1: Сборка и линт всего репозитория**

Run: `npm run build && npm run lint`
Expected: чисто, без ошибок и новых предупреждений.

- [ ] **Step 2: Ручной прогон в браузере** (dev-сервер на localhost:5173,
`/leads`)

1. 7 колонок в правильном порядке: Новый лид / Дозвон / Пробный назначен /
   Пробный проведён / Дожим / Оплачено / Отказ.
2. Существующие (мигрированные в Task 10) лиды видны в ожидаемых колонках.
3. «Добавить лида» — новый лид попадает в «Новый лид», тег оператора на
   карточке — не пустой (round-robin отработал), и повторное добавление
   лида показывает **другого** оператора (проверить на 2+ лидах подряд).
4. Отметить попытку дозвона на новом лиде → карточка переезжает в «Дозвон»
   автоматически.
5. Довести до 5 неудачных попыток на другом лиде → авто-переход в «Отказ»,
   `lostReason` = «Не дозвонились» в карточке студента.
6. «Записать на пробный» → форма даты/времени/учителя → карточка в
   «Пробный назначен», дата видна на карточке.
7. «Не пришёл» → форма снова, новая дата, карточка остаётся в «Пробный
   назначен» (не переезжает).
8. «Пришёл» → попап вовлечённости → карточка в «Пробный проведён», затем
   почти сразу — «Дожим» (авто-переход, если не было оплаты).
9. «Отметить касание» 3 раза → счётчик 1/3 → 2/3 → 3/3, кнопка исчезает
   после третьего.
10. Попробовать перетащить карточку НАЗАД (например из «Дожим» в «Дозвон»)
    drag-n-drop — должно быть отклонено (карточка не переезжает, либо тост
    с ошибкой).
11. Отказ с указанием причины из списка (не свободный текст) — карточка
    переезжает в «Отказ», видна причина под именем.
12. Создать лид, вручную поставить `students/{id}.createdAt` на время
    более 15 минут назад через консоль Firestore (или подождать) — красная
    рамка/иконка SLA появляется на карточке в колонке «Новый лид».
13. `/reports` → вкладка «Воронка по операторам» — таблица с процентами
    без ошибок в консоли браузера.
14. `/reports` → вкладка «Ремаркетинг» — либо пусто (нормально, если нет
    отказов старше 30 дней), либо список без ошибок.
15. Регрессия: `/students`, `/teachers-groups`, `/settings`, оплата через
    `AddPaymentModal` на обычном активном студенте (не лиде) — платёж
    проходит как раньше, `funnelStage`-логика не мешает (студент без этого
    поля просто пропускает `wonFields`-ветку в `recordPayment`).
16. Мобильный вьюпорт — горизонтальный скролл 7 колонок работает.

- [ ] **Step 3: Тестовые данные**

Заархивировать/удалить все тестовые лиды, созданные во время проверки —
как в предыдущей итерации (`2026-08-12-leads-kanban.md`, Task 8).

---

## Post-plan

После всех задач — финальный ревью всей ветки (`superpowers:requesting-
code-review`, самая мощная доступная модель) и `superpowers:finishing-a-
development-branch` для мержа. Учитывая размер изменений (12 файлов,
новая коллекция полей на `students`, новый индекс), финальный ревьюер
должен отдельно проверить: (а) что ни одна из НЕ-lead страниц не сломалась
из-за нового индекса/полей на `students`, (б) что `firestore.indexes.json`
реально задеплоен, а не только закоммичен в репозиторий.
