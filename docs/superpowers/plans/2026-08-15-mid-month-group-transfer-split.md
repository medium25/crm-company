# Дробление списания и оплаты при переводе студента в другую группу — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** При переводе студента посреди оплаченного месяца (`TransferGroupModal`) списание и — по выбору пользователя — уже внесённая оплата дробятся между старой и новой записью по вручную введённому числу уроков, вместо переноса без учёта денег как сейчас.

**Architecture:** Вся логика живёт в двух местах: чистые формулы (`chargeAmountForLessons`, `defaultPaymentSplitAmount`) в `src/lib/billing.js`, тестируемые разовым node-скриптом; Firestore-запись (правка/создание транзакций, инкременты баланса) — напрямую в `TransferGroupModal.jsx` одним `writeBatch`, тем же паттерном, что уже используют закрытие старой записи и создание новой в этом файле. Отдельных хелперов, коммитящих собственный batch (`writeTransaction`/`updateTransaction`), здесь не переиспользуем — они не дают писать несколько документов в одной атомарной операции.

**Tech Stack:** React 19 + Firestore JS SDK (клиент пишет в Firestore напрямую, backend'а нет), без тестового фреймворка — чистая логика проверяется node-скриптом с `node:assert/strict`.

## Global Constraints

- Дробление уроков — только ручной ввод пользователем (не по расписанию/датам) — спека, раздел «Сколько уроков уже прошло».
- `totalOld` = `lessonsCount` существующей `charge_{oldEnrollmentId}_{month}`, если есть, иначе `oldGroup.lessonsPerMonth`. `remaining = totalOld - alreadyHad`.
- Новое списание считается по цене/тарифу НОВОЙ группы (поле «Стоимость для студента», как сейчас), не пропорционально старой оплате.
- Оплата дробится физически — правкой исходной транзакции + созданием второй с `groupId`/`teacherId` новой группы — но это опционально по чекбоксу на каждую оплату месяца, сумма переноса не обязана совпадать с суммой нового списания.
- Если `charge_{oldEnrollmentId}_{month}` ещё не существует — создаётся сразу с частичной суммой (билинг-ран станет no-op по идемпотентности ID). Если `alreadyHad === 0` и транзакции ещё не было — старое списание не создаётся вовсе.
- Если `remaining === 0` — новое списание не создаётся.
- Всё (закрытие старой записи, создание новой, `studentsCount` обеих групп, правка/создание charge- и payment-транзакций, инкременты `students.balance`/`monthlyBalances`/`monthlyRevenue`) — один `writeBatch`.
- Правка `transactions` через `batch.update` разрешена Firestore-правилом только для полей `['amount', 'comment', 'date', 'month', 'updatedAt', 'updatedBy']` (`firestore.rules:98`) — `lessonsCount` в этот список НЕ входит, поэтому его нужно туда добавить, иначе аменд старого списания упадёт с `permission-denied`.
- Полный спек: [`docs/superpowers/specs/2026-08-15-mid-month-group-transfer-split-design.md`](../specs/2026-08-15-mid-month-group-transfer-split-design.md).

---

### Task 1: Чистые формулы дробления — `chargeAmountForLessons` / `defaultPaymentSplitAmount`

**Files:**
- Modify: `src/lib/billing.js:44` (после `pricePerLesson`)
- Test: `scripts/test-billing-transfer-split.mjs` (создать)

**Interfaces:**
- Produces: `chargeAmountForLessons(enrollment: {price: number}, group: {lessonsPerMonth: number}, lessonsCount: number): number` (отрицательное — сумма списания), `defaultPaymentSplitAmount(paymentAmount: number, remainingLessons: number, totalLessons: number): number` — используются в Task 3.

- [ ] **Step 1: Написать проверочный скрипт (упадёт — функций ещё нет)**

Создать `scripts/test-billing-transfer-split.mjs`:

```js
// scripts/test-billing-transfer-split.mjs
// Разовая проверка чистых формул дробления списания/оплаты при переводе
// студента — без фреймворка, по образцу scripts/test-lead-assignment.mjs.
// Запуск: node scripts/test-billing-transfer-split.mjs
import assert from 'node:assert/strict';
import { chargeAmountForLessons, defaultPaymentSplitAmount } from '../src/lib/billing.js';

// 12 уроков в месяц, цена 600000 — 50000 за урок
const enrollment = { price: 600000 };
const group = { lessonsPerMonth: 12 };

assert.equal(chargeAmountForLessons(enrollment, group, 6), -300000, '6 из 12 уроков — половина суммы');
assert.ok(chargeAmountForLessons(enrollment, group, 0) === 0, '0 уроков — 0 списания');
assert.equal(chargeAmountForLessons(enrollment, group, 12), -600000, 'все 12 — полная сумма');

// округление: цена не делится ровно на число уроков
const oddEnrollment = { price: 100000 };
const oddGroup = { lessonsPerMonth: 3 };
assert.equal(chargeAmountForLessons(oddEnrollment, oddGroup, 1), -33333, 'округление до целого');

assert.equal(defaultPaymentSplitAmount(600000, 6, 12), 300000, 'половина оплаты — новой группе');
assert.equal(defaultPaymentSplitAmount(600000, 0, 12), 0, 'ничего не осталось новой группе');
assert.equal(defaultPaymentSplitAmount(600000, 12, 12), 600000, 'вся оплата — новой группе');
assert.equal(defaultPaymentSplitAmount(600000, 6, 0), 0, 'totalLessons=0 — защита от деления на 0');

console.log('OK: billing transfer-split tests passed');
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run: `node scripts/test-billing-transfer-split.mjs`
Expected: `SyntaxError` или `TypeError: chargeAmountForLessons is not a function` (функции ещё не экспортированы).

- [ ] **Step 3: Добавить функции в `billing.js`**

В `src/lib/billing.js`, сразу после функции `pricePerLesson` (строка 44, перед комментарием `/** Пишет транзакцию...`), вставить:

```js

/**
 * Сумма списания за заданное число уроков по цене конкретной записи —
 * общая формула для частичного списания (chargePartialMonth,
 * computeMonthlyChargeAmount) и для дробления списания при переводе
 * студента в другую группу посреди месяца (TransferGroupModal).
 * @param {{price: number}} enrollment
 * @param {{lessonsPerMonth: number}} group
 * @param {number} lessonsCount
 * @returns {number} отрицательное число (списание) или 0
 */
export function chargeAmountForLessons(enrollment, group, lessonsCount) {
  return -Math.round(pricePerLesson(enrollment, group) * lessonsCount);
}

/**
 * Дефолтная сумма оплаты, переносимая на новую группу при переводе студента
 * посреди месяца — пропорционально доле оставшихся уроков. Только
 * предзаполнение поля формы, пользователь может изменить вручную —
 * см. TransferGroupModal.
 * @param {number} paymentAmount
 * @param {number} remainingLessons
 * @param {number} totalLessons
 * @returns {number}
 */
export function defaultPaymentSplitAmount(paymentAmount, remainingLessons, totalLessons) {
  if (totalLessons <= 0) return 0;
  return Math.round((paymentAmount * remainingLessons) / totalLessons);
}
```

- [ ] **Step 4: Запустить и убедиться, что проходит**

Run: `node scripts/test-billing-transfer-split.mjs`
Expected: `OK: billing transfer-split tests passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing.js scripts/test-billing-transfer-split.mjs
git commit -m "feat(billing): add pure lesson-split formulas for mid-month group transfer"
```

---

### Task 2: Firestore — индекс под запрос оплат месяца + разрешить `lessonsCount` в аменде транзакции

**Files:**
- Modify: `firestore.indexes.json:325-331` (новый индекс)
- Modify: `firestore.rules:97-98` (разрешённые поля аменда `transactions`)

**Interfaces:** нет (конфигурация, не код).

- [ ] **Step 1: Добавить композитный индекс `transactions [studentId, month]`**

В `firestore.indexes.json`, сразу после первого блока `transactions` (строки 325-331 — `studentId` + `date`), вставить новый блок индекса (нужен запросу `where('studentId','==',...) + where('month','==',...)` в Task 3 — сам `type` фильтруется на клиенте, третье поле в индекс не добавляем):

Текущий фрагмент:

```json
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "studentId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
```

заменить на (добавлен новый блок сразу после):

```json
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "studentId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "transactions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "studentId", "order": "ASCENDING" },
        { "fieldPath": "month", "order": "ASCENDING" }
      ]
    },
```

- [ ] **Step 2: Разрешить `lessonsCount` в правиле аменда `transactions`**

В `firestore.rules`, строки 95-98:

```
      // updateTransaction правит только сумму/комментарий/дату/месяц записи
      // на месте (без компенсирующих проводок).
      allow update: if isAdmin() &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['amount', 'comment', 'date', 'month', 'updatedAt', 'updatedBy']);
```

заменить на:

```
      // updateTransaction правит сумму/комментарий/дату/месяц записи на
      // месте (без компенсирующих проводок). lessonsCount — дополнительно
      // для дробления списания при переводе студента посреди месяца
      // (TransferGroupModal, billing.chargeAmountForLessons).
      allow update: if isAdmin() &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['amount', 'comment', 'date', 'month', 'lessonsCount', 'updatedAt', 'updatedBy']);
```

- [ ] **Step 3: Валидировать правила и индексы локально**

Run: `npx firebase-tools deploy --only firestore:rules,firestore:indexes --dry-run 2>&1 | head -50`
Expected: если Firebase CLI не залогинен в этом окружении — команда упадёт на авторизации, это ожидаемо (см. Step 4). Если `firebase-tools` не установлен глобально — `npx` подтянет его сам (может занять минуту).

- [ ] **Step 4: Задеплоить руками (не автоматизируется в этой сессии)**

Это правки shared-инфраструктуры (Firestore rules/indexes) — задеплоить обязан пользователь сам из авторизованного окружения:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Без этого шага Task 3 (правка `lessonsCount` на транзакции) будет падать в проде/деве с `permission-denied`, а запрос оплат месяца — с ошибкой `The query requires an index` (Firestore обычно даёт прямую ссылку на автосоздание индекса в консоли — тоже сработает как альтернатива ручному деплою индексов).

- [ ] **Step 5: Commit**

```bash
git add firestore.indexes.json firestore.rules
git commit -m "feat(billing): allow lessonsCount amend on transactions, add studentId+month index"
```

---

### Task 3: `TransferGroupModal.jsx` — UI и запись дробления

**Files:**
- Modify: `src/components/students/TransferGroupModal.jsx` (переписывается целиком)

**Interfaces:**
- Consumes: `chargeAmountForLessons`, `defaultPaymentSplitAmount` (Task 1), `useDoc` (`src/hooks/useDoc.js`, существующий), `formatMoney`/`formatMethod` (`src/lib/format.js`, существующие).

- [ ] **Step 1: Заменить файл целиком**

Заменить полное содержимое `src/components/students/TransferGroupModal.jsx` на:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { collection, doc, writeBatch, increment, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { chargeAmountForLessons, defaultPaymentSplitAmount } from '../../lib/billing.js';
import { logActivity } from '../../lib/activityLog.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { formatMoney, formatMethod } from '../../lib/format.js';

/**
 * Перевод студента из текущей группы в другую — закрывает старый enrollment
 * (`status: 'left'`, `returnIntent: 'transfer'`, чтобы не попадал в списки
 * «Хочет вернуться»/«Не хочет возвращаться» на «Покинувших» и не путался с
 * настоящим уходом) и сразу создаёт новый в целевой группе с тем же
 * статусом. `activatedAt` переносится как есть.
 *
 * Если месяц уже оплачен/списан в старой группе — списание дробится между
 * старой и новой записью по вручную введённому числу «уроков уже прошло»;
 * оплата этого месяца дробится опционально, по выбору пользователя на
 * каждую транзакцию — см. `docs/superpowers/specs/2026-08-15-mid-month-group-transfer-split-design.md`.
 * @param {Object} props
 * @param {Object|null} props.enrollment запись, которую переводим, или null (закрыто)
 * @param {{id: string, fullName: string}} props.student
 * @param {() => void} props.onClose
 */
export function TransferGroupModal({ enrollment, student, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();

  const groupsQuery = useMemo(
    () =>
      db && enrollment
        ? query(collection(db, 'groups'), where('branchId', '==', enrollment.branchId), where('isArchived', '==', false))
        : null,
    [enrollment],
  );
  const { data: allGroups } = useCollection(groupsQuery);
  const groups = useMemo(() => allGroups.filter((g) => g.id !== enrollment?.groupId), [allGroups, enrollment]);

  const [groupId, setGroupId] = useState('');
  const [price, setPrice] = useState('');
  const [transferredAt, setTransferredAt] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [alreadyHad, setAlreadyHad] = useState('');
  const [paymentSplits, setPaymentSplits] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enrollment) {
      setGroupId('');
      setPrice('');
      setTransferredAt(format(new Date(), 'yyyy-MM-dd'));
      setAlreadyHad('');
      setPaymentSplits({});
    }
  }, [enrollment]);

  const targetGroup = groups.find((g) => g.id === groupId);
  const month = transferredAt ? format(new Date(`${transferredAt}T00:00:00`), 'yyyy-MM') : '';

  const oldGroupRef = useMemo(() => (db && enrollment ? doc(db, 'groups', enrollment.groupId) : null), [enrollment]);
  const { data: oldGroup } = useDoc(oldGroupRef);

  const oldChargeRef = useMemo(
    () => (db && enrollment && month ? doc(db, 'transactions', `charge_${enrollment.id}_${month}`) : null),
    [enrollment, month],
  );
  const { data: oldCharge } = useDoc(oldChargeRef);

  const totalOld = oldCharge?.lessonsCount ?? oldGroup?.lessonsPerMonth ?? 0;
  const alreadyHadNum = Math.min(Math.max(Number(alreadyHad) || 0, 0), totalOld);
  const remaining = Math.max(totalOld - alreadyHadNum, 0);

  const paymentsQuery = useMemo(
    () =>
      db && enrollment && month
        ? query(collection(db, 'transactions'), where('studentId', '==', enrollment.studentId), where('month', '==', month))
        : null,
    [enrollment, month],
  );
  const { data: monthTxs } = useCollection(paymentsQuery);
  const payments = useMemo(() => monthTxs.filter((t) => t.type === 'payment'), [monthTxs]);

  const getSplit = (paymentId) => paymentSplits[paymentId] ?? { checked: false, amount: '' };

  const toggleSplit = (payment) => {
    setPaymentSplits((prev) => {
      const current = prev[payment.id] ?? { checked: false, amount: '' };
      const amount = current.amount || String(defaultPaymentSplitAmount(payment.amount, remaining, totalOld));
      return { ...prev, [payment.id]: { checked: !current.checked, amount } };
    });
  };

  const setSplitAmount = (paymentId, amount) => {
    setPaymentSplits((prev) => ({ ...prev, [paymentId]: { ...(prev[paymentId] ?? { checked: false }), amount } }));
  };

  const handleGroupChange = (id) => {
    setGroupId(id);
    const g = groups.find((gr) => gr.id === id);
    if (g) setPrice(String(g.price));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!enrollment || !targetGroup || !transferredAt) return;
    setSaving(true);
    try {
      const priceNum = Number(price);
      const discountPercent = targetGroup.price > 0 ? Math.round((1 - priceNum / targetGroup.price) * 100) : 0;
      const now = serverTimestamp();
      const transferredAtTs = Timestamp.fromDate(new Date(`${transferredAt}T00:00:00`));

      const batch = writeBatch(db);

      batch.update(doc(db, 'enrollments', enrollment.id), {
        status: 'left',
        leftAt: transferredAtTs,
        leftReason: `Перевод в группу ${targetGroup.code}`,
        returnIntent: 'transfer',
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(db, 'groups', enrollment.groupId), { studentsCount: increment(-1) });

      const newEnrollmentRef = doc(collection(db, 'enrollments'));
      batch.set(newEnrollmentRef, {
        branchId: targetGroup.branchId,
        studentId: enrollment.studentId,
        studentName: enrollment.studentName,
        groupId: targetGroup.id,
        groupCode: targetGroup.code,
        courseName: targetGroup.courseName,
        teacherId: targetGroup.teacherId,
        teacherName: targetGroup.teacherName,
        status: enrollment.status,
        statusLabel: enrollment.statusLabel,
        price: priceNum,
        discountPercent,
        discountReason: '',
        addedAt: now,
        activatedAt: enrollment.activatedAt ?? null,
        pausedFrom: enrollment.pausedFrom ?? null,
        pausedTo: enrollment.pausedTo ?? null,
        leftAt: null,
        leftReason: null,
        lastChargedMonth: enrollment.lastChargedMonth ?? null,
        isArchived: false,
        transferredFromGroupId: enrollment.groupId,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(db, 'groups', targetGroup.id), { studentsCount: increment(1) });

      // --- Дробление списания этого месяца между старой и новой группой ---
      if (oldGroup && totalOld > 0) {
        const oldChargeTxRef = doc(db, 'transactions', `charge_${enrollment.id}_${month}`);
        const oldChargeAmount = chargeAmountForLessons(enrollment, oldGroup, alreadyHadNum);

        if (oldCharge) {
          const delta = oldChargeAmount - oldCharge.amount;
          if (delta !== 0) {
            batch.update(oldChargeTxRef, {
              amount: oldChargeAmount,
              lessonsCount: alreadyHadNum,
              comment: `${alreadyHadNum} ур. (перевод в ${targetGroup.code})`,
              updatedAt: now,
              updatedBy: user.uid,
            });
            batch.update(doc(db, 'students', enrollment.studentId), { balance: increment(delta), balanceUpdatedAt: now });
            batch.set(
              doc(db, 'monthlyBalances', `${enrollment.studentId}_${month}`),
              { charges: increment(delta), balance: increment(delta), updatedAt: now },
              { merge: true },
            );
          }
        } else if (alreadyHadNum > 0) {
          const monthStartTs = Timestamp.fromDate(startOfMonth(new Date(`${transferredAt}T00:00:00`)));
          batch.set(oldChargeTxRef, {
            studentId: enrollment.studentId,
            studentName: enrollment.studentName,
            branchId: oldGroup.branchId,
            enrollmentId: enrollment.id,
            groupId: oldGroup.id,
            groupCode: oldGroup.code,
            teacherId: oldGroup.teacherId,
            teacherName: oldGroup.teacherName,
            type: 'charge',
            amount: oldChargeAmount,
            affectsBalance: true,
            method: null,
            date: monthStartTs,
            month,
            comment: `${alreadyHadNum} ур. (перевод в ${targetGroup.code})`,
            periodFrom: monthStartTs,
            periodTo: transferredAtTs,
            lessonsCount: alreadyHadNum,
            createdBy: user.uid,
            createdByName: staff?.fullName ?? '',
            createdAt: now,
          });
          batch.update(doc(db, 'students', enrollment.studentId), { balance: increment(oldChargeAmount), balanceUpdatedAt: now });
          batch.set(
            doc(db, 'monthlyBalances', `${enrollment.studentId}_${month}`),
            { charges: increment(oldChargeAmount), balance: increment(oldChargeAmount), updatedAt: now },
            { merge: true },
          );
        }

        if (remaining > 0) {
          const monthEndTs = Timestamp.fromDate(endOfMonth(new Date(`${transferredAt}T00:00:00`)));
          const newChargeAmount = chargeAmountForLessons({ price: priceNum }, targetGroup, remaining);
          batch.set(doc(db, 'transactions', `charge_${newEnrollmentRef.id}_${month}`), {
            studentId: enrollment.studentId,
            studentName: enrollment.studentName,
            branchId: targetGroup.branchId,
            enrollmentId: newEnrollmentRef.id,
            groupId: targetGroup.id,
            groupCode: targetGroup.code,
            teacherId: targetGroup.teacherId,
            teacherName: targetGroup.teacherName,
            type: 'charge',
            amount: newChargeAmount,
            affectsBalance: true,
            method: null,
            date: transferredAtTs,
            month,
            comment: `${remaining} ур. (перевод из ${oldGroup.code})`,
            periodFrom: transferredAtTs,
            periodTo: monthEndTs,
            lessonsCount: remaining,
            createdBy: user.uid,
            createdByName: staff?.fullName ?? '',
            createdAt: now,
          });
          batch.update(doc(db, 'students', enrollment.studentId), { balance: increment(newChargeAmount), balanceUpdatedAt: now });
          batch.set(
            doc(db, 'monthlyBalances', `${enrollment.studentId}_${month}`),
            { charges: increment(newChargeAmount), balance: increment(newChargeAmount), updatedAt: now },
            { merge: true },
          );
          batch.update(newEnrollmentRef, { lastChargedMonth: month });
        }
      }

      // --- Дробление отмеченных оплат этого месяца ---
      for (const payment of payments) {
        const split = paymentSplits[payment.id];
        if (!split?.checked) continue;
        const moveAmount = Math.min(Math.max(Number(split.amount) || 0, 0), payment.amount);
        if (moveAmount <= 0) continue;

        batch.update(doc(db, 'transactions', payment.id), {
          amount: payment.amount - moveAmount,
          updatedAt: now,
          updatedBy: user.uid,
        });

        const newPaymentRef = doc(collection(db, 'transactions'));
        batch.set(newPaymentRef, {
          studentId: payment.studentId,
          studentName: payment.studentName,
          branchId: payment.branchId,
          enrollmentId: newEnrollmentRef.id,
          groupId: targetGroup.id,
          groupCode: targetGroup.code,
          teacherId: targetGroup.teacherId,
          teacherName: targetGroup.teacherName,
          type: 'payment',
          amount: moveAmount,
          affectsBalance: true,
          method: payment.method,
          date: payment.date,
          month: payment.month,
          comment: `Перенос из оплаты ${payment.id} при переводе в ${targetGroup.code}`,
          periodFrom: null,
          periodTo: null,
          lessonsCount: null,
          createdBy: user.uid,
          createdByName: staff?.fullName ?? '',
          createdAt: now,
        });
        batch.set(
          doc(db, 'monthlyRevenue', `${payment.branchId}_${payment.month}`),
          { paymentsCount: increment(1), updatedAt: now },
          { merge: true },
        );
      }

      await batch.commit();
      await recomputeStudentAggregates(db, enrollment.studentId);

      const actor = { uid: user.uid, fullName: staff?.fullName ?? '' };
      await logActivity(
        db,
        { entityType: 'group', entityId: enrollment.groupId, action: 'enrollment_transferred_out', field: 'studentsCount', before: enrollment.studentName, after: targetGroup.code },
        actor,
      );
      await logActivity(
        db,
        { entityType: 'group', entityId: targetGroup.id, action: 'enrollment_transferred_in', field: 'studentsCount', before: enrollment.groupCode, after: enrollment.studentName },
        actor,
      );

      showToast('Студент переведён в другую группу.');
      onClose();
    } catch {
      showToast('Не удалось перевести студента.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Перевести в другую группу"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!groupId || !transferredAt}>
            Перевести
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[15px] text-text">
          Студент <b>{enrollment?.studentName}</b> покинет группу <b>{enrollment?.groupCode}</b> и будет добавлен в
          выбранную группу с тем же статусом (<b>{enrollment?.statusLabel}</b>).
        </p>
        <Select
          label="Новая группа"
          required
          options={[{ value: '', label: 'Выбрать' }, ...groups.map((g) => ({ value: g.id, label: `${g.code} · ${g.courseName}` }))]}
          value={groupId}
          onChange={(e) => handleGroupChange(e.target.value)}
        />
        <Input
          label="Стоимость для студента"
          type="number"
          min="0"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <DatePicker label="Дата перевода" required value={transferredAt} onChange={(e) => setTransferredAt(e.target.value)} />

        {totalOld > 0 && (
          <>
            <Input
              label={`Уроков уже прошло в ${enrollment?.groupCode ?? ''} в этом месяце`}
              type="number"
              min="0"
              max={totalOld}
              value={alreadyHad}
              onChange={(e) => setAlreadyHad(e.target.value)}
            />
            <p className="text-[13px] text-muted">
              Спишется {alreadyHadNum} ур. со старой группы, {remaining} ур. с новой (из {totalOld}).
            </p>
          </>
        )}

        {payments.length > 0 && (
          <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
            <p className="text-[13px] font-bold text-muted">Оплаты этого месяца — разделить между группами</p>
            {payments.map((payment) => {
              const split = getSplit(payment.id);
              return (
                <div key={payment.id} className="flex items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-[15px] text-text">
                    <input type="checkbox" checked={split.checked} onChange={() => toggleSplit(payment)} />
                    {formatMoney(payment.amount)} · {formatMethod(payment.method)} ·{' '}
                    {payment.date ? format(payment.date.toDate(), 'dd.MM.yyyy') : ''}
                  </label>
                  <div className="w-32">
                    <Input
                      type="number"
                      min="0"
                      max={payment.amount}
                      disabled={!split.checked}
                      value={split.amount}
                      onChange={(e) => setSplitAmount(payment.id, e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </form>
    </Modal>
  );
}
```

- [ ] **Step 2: Проверить, что `formatMoney`/`formatMethod` экспортированы из `format.js`**

Run: `grep -n "export function formatMoney\|export function formatMethod" src/lib/format.js`
Expected: обе строки найдены (уже используются в `AddPaymentModal.jsx`, см. импорт там).

- [ ] **Step 3: Проверить линтером**

Run: `npm run lint`
Expected: без ошибок в `TransferGroupModal.jsx`.

- [ ] **Step 4: Ручная проверка в браузере — базовый сценарий без денег**

Запустить дев-сервер (`.claude/launch.json`, конфигурация дев-сервера проекта), открыть карточку студента без списаний/оплат в текущем месяце (или тестового студента без enrollment charges), «Перевести в другую группу»:
- Поле «Уроков уже прошло» не показывается (`totalOld === 0`, т.к. нет ни `charge`-транзакции, ни `oldGroup.lessonsPerMonth` не подтянулся — если у группы `lessonsPerMonth` задан всегда, поле покажется с `alreadyHad` от 0 до `lessonsPerMonth`; это ожидаемо).
- Блок оплат не показывается, если у студента нет платежей за этот месяц.
- Перевод проходит как раньше (только смена группы), тост «Студент переведён в другую группу.».

- [ ] **Step 5: Commit**

```bash
git add src/components/students/TransferGroupModal.jsx
git commit -m "feat(students): split monthly charge and payment on mid-month group transfer"
```

---

### Task 4: Сквозная проверка сценариев дробления в браузере

**Files:** нет изменений — только verification.

- [ ] **Step 1: Подготовить тестового студента**

В деве создать (или использовать существующего тестового) студента, активировать в группе A (`lessonsPerMonth: 12`, любая цена, например 600 000), прогнать биллинг-ран (кнопка в топбаре/баннере) или дождаться, чтобы за текущий месяц появилось списание `charge_{enrollmentId}_{YYYY-MM}` на -600 000 и добавить оплату «Добавить оплату» на 600 000 в текущем месяце.

- [ ] **Step 2: Основной сценарий — 6 из 12, оплата дробится**

Открыть «Перевести в другую группу» у этой записи, выбрать группу B (другой `lessonsPerMonth`/цена — например 12 уроков, 700 000), ввести «Уроков уже прошло» = 6. Проверить:
- Текст живого пересчёта показывает «Спишется 6 ур. со старой группы, 6 ур. с новой (из 12)».
- В блоке «Оплаты этого месяца» видна оплата 600 000, чекбокс не отмечен, поле суммы пустое/неактивно.
- Отметить чекбокс — поле суммы автозаполняется дефолтом 300 000 (`round(600000*6/12)`), отредактировать на 250 000.
- Нажать «Перевести». Открыть карточку студента → История операций (или где отображаются транзакции):
  - Старое списание группы A теперь -300 000, `6 ур.` в комментарии.
  - Новое списание группы B — `-round(700000/12*6)` = -350 000, `6 ур.` в комментарии.
  - Оплата — исходная теперь 350 000 (600000-250000), появилась вторая оплата 250 000 с привязкой к группе B.
- Баланс студента (`students.balance`) не изменился от дробления оплаты (250 000 просто переехали), но изменился на разницу списаний: было -600000+600000=0, стало -300000-350000+600000=-50000 (новая группа дороже на 50000/12*6≈4167... сверить точную цифру по факту, не наизусть — смысл проверки: баланс равен сумме всех транзакций, не рассинхронизирован).

- [ ] **Step 3: Граничный случай — alreadyHad = 0**

Повторить перевод для другого тестового enrollment без предварительного списания/оплаты этого месяца (или у которого `charge_...` ещё не создан), ввести 0 уроков прошло. Проверить: старое списание НЕ создаётся вовсе (в истории транзакций нет `charge_{oldEnrollmentId}_{month}` с нулевой суммой), новое списание создаётся на полное `remaining = totalOld`.

- [ ] **Step 4: Граничный случай — alreadyHad = totalOld (весь месяц у старой группы)**

Ввести `alreadyHad` равным `totalOld` (например 12 из 12). Проверить: новое списание НЕ создаётся (нет транзакции `charge_{newEnrollmentId}_{month}`), старое списание остаётся равным полной сумме месяца (фактически не поменялось, `delta === 0`, batch.update для него не должен был выполниться — проверить, что `updatedAt` старой транзакции НЕ изменился, если так реализовано условие `delta !== 0`).

- [ ] **Step 5: Нет оплат этого месяца**

На студенте без оплат за текущий месяц (или после исчерпания в Step 2) убедиться, что блок «Оплаты этого месяца» не рендерится вовсе — перевод проходит, дробится только списание.

- [ ] **Step 6: Проверить `permission-denied` защиту от Task 2 снята**

Если Task 2 Step 4 (деплой rules/indexes) не был выполнен пользователем к моменту этой проверки — Step 2 выше упадёт в консоли браузера с `FirebaseError: Missing or insufficient permissions` при попытке амендить `lessonsCount`, либо с `FirebaseError: The query requires an index` при загрузке блока оплат. В этом случае — остановиться и напомнить пользователю задеплоить `firebase deploy --only firestore:rules,firestore:indexes` (или перейти по ссылке на автосоздание индекса из текста ошибки в консоли) перед продолжением проверки.

- [ ] **Step 7: Прогнать lint по проекту**

Run: `npm run lint`
Expected: без новых ошибок.

- [ ] **Step 8: Финальный commit (если проверка нашла и потребовала правок)**

```bash
git add -A
git commit -m "fix(students): address issues found during transfer-split e2e verification"
```

Если правок не потребовалось — commit не нужен, задача закрыта на Task 3.
