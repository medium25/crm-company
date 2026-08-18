import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  updateDoc,
  runTransaction,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { format, endOfMonth, startOfMonth, addDays, subDays } from 'date-fns';
import { lessonsInRange } from './schedule.js';

/** Минимальный положительный баланс студента, при котором разрешена заморозка записи. */
export const MIN_FREEZE_BALANCE = 140000;

/** Сколько раз студент может замораживать записи за весь срок обучения. */
export const MAX_FREEZES_PER_STUDENT = 2;

/**
 * Можно ли студенту заморозить запись — баланс не ниже MIN_FREEZE_BALANCE и
 * лимит заморозок за весь срок обучения (MAX_FREEZES_PER_STUDENT) не исчерпан.
 * @param {{balance?: number, freezeCount?: number}} student
 * @returns {boolean}
 */
export function canFreezeStudent(student) {
  const balance = student?.balance ?? 0;
  const freezeCount = student?.freezeCount ?? 0;
  return balance >= MIN_FREEZE_BALANCE && freezeCount < MAX_FREEZES_PER_STUDENT;
}

/**
 * Цена одного урока для конкретной записи — «03 · Бизнес-логика» §3.1.
 * @param {{price: number}} enrollment
 * @param {{lessonsPerMonth: number}} group
 * @returns {number}
 */
export function pricePerLesson(enrollment, group) {
  return enrollment.price / group.lessonsPerMonth;
}

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
  const amount = -Math.round(pricePerLesson(enrollment, group) * lessonsCount);
  return amount === 0 ? 0 : amount;
}


/**
 * Пишет транзакцию и одной batch-операцией обновляет `students.balance` и
 * `monthlyBalances/{studentId}_{month}` — «02 · Модель данных»,
 * «Денормализация: что и когда пересчитывать».
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} tx поля транзакции (без createdAt — проставляется здесь)
 * @param {string} [tx.id] explicit ID (списания) — иначе авто
 * @returns {Promise<string>} ID созданной транзакции
 */
/**
 * @param {Object} tx
 * @param {boolean} [tx.affectsBalance] false — не трогает student.balance/
 *   lastPaymentAt/monthlyBalances (напр. оплата учебных материалов —
 *   разовый платёж, не долг за курс; recalcBalance тоже это исключает,
 *   см. ниже). Всё равно пишется в transactions и monthlyRevenue (реальная
 *   выручка), просто не влияет на баланс студента.
 */
export async function writeTransaction(db, tx) {
  const { id, studentId, amount, month, type, branchId, affectsBalance = true, ...rest } = tx;
  const batch = writeBatch(db);
  const txRef = id ? doc(db, 'transactions', id) : doc(collection(db, 'transactions'));

  batch.set(txRef, {
    studentId,
    amount,
    month,
    type,
    branchId,
    affectsBalance,
    ...rest,
    createdAt: serverTimestamp(),
  });

  if (affectsBalance) {
    const studentUpdate = {
      balance: increment(amount),
      balanceUpdatedAt: serverTimestamp(),
    };
    if (type === 'payment') {
      studentUpdate.lastPaymentAt = serverTimestamp();
    }
    batch.update(doc(db, 'students', studentId), studentUpdate);

    batch.set(
      doc(db, 'monthlyBalances', `${studentId}_${month}`),
      {
        studentId,
        month,
        charges: increment(amount < 0 ? amount : 0),
        payments: increment(amount > 0 ? amount : 0),
        balance: increment(amount),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  // График выручки дашборда читает предпосчитанный агрегат, а не всю
  // коллекцию transactions — только реальные оплаты, не списания/сторно.
  // Материалы (affectsBalance:false) сюда всё равно попадают — это
  // реальная полученная выручка, просто не долг за курс.
  if (type === 'payment' && branchId) {
    batch.set(
      doc(db, 'monthlyRevenue', `${branchId}_${month}`),
      {
        branchId,
        month,
        amount: increment(amount),
        paymentsCount: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
  return txRef.id;
}

/**
 * Частичное списание при активации записи в середине месяца —
 * «03 · Бизнес-логика» §3.2. Идемпотентно по ID `charge_{enrollmentId}_{YYYY-MM}`:
 * повторный вызов для того же месяца не создаёт вторую запись.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{student: Object, enrollment: Object, group: Object, holidays?: string[]}} ctx
 * @param {{uid: string, fullName: string}} user
 * @returns {Promise<string|null>} ID транзакции, или null если уже списано / 0 уроков
 */
export async function chargePartialMonth(db, { student, enrollment, group, holidays = [] }, user) {
  const activatedAt = enrollment.activatedAt.toDate();
  const month = format(activatedAt, 'yyyy-MM');
  const txId = `charge_${enrollment.id}_${month}`;

  const existing = await getDoc(doc(db, 'transactions', txId));
  if (existing.exists()) return null;

  const monthEnd = endOfMonth(activatedAt);
  const lessonsLeft = lessonsInRange(group.schedule, activatedAt, monthEnd, holidays);
  if (lessonsLeft === 0) return null;

  const amount = -Math.round(pricePerLesson(enrollment, group) * lessonsLeft);

  await writeTransaction(db, {
    id: txId,
    branchId: group.branchId,
    studentId: student.id,
    studentName: student.fullName,
    enrollmentId: enrollment.id,
    groupId: group.id,
    groupCode: group.code,
    teacherId: group.teacherId,
    teacherName: group.teacherName,
    type: 'charge',
    amount,
    method: null,
    date: Timestamp.fromDate(startOfMonth(activatedAt)),
    month,
    comment: `${lessonsLeft} ур.`,
    periodFrom: Timestamp.fromDate(activatedAt),
    periodTo: Timestamp.fromDate(monthEnd),
    lessonsCount: lessonsLeft,
    createdBy: user.uid,
    createdByName: user.fullName,
  });

  await updateDoc(doc(db, 'enrollments', enrollment.id), { lastChargedMonth: month });
  return txId;
}

/**
 * Сумма и число уроков ежемесячного списания. Обычный месяц — фиксированная
 * `enrollment.price` (расчёт не зависит от факта уроков в конкретном
 * календарном месяце — в этом весь смысл `lessonsPerMonth`-нормализации).
 * Полностью замороженный месяц — 0. Частично замороженный — по формуле
 * частичного месяца, по фактическим урокам вне интервала заморозки
 * («03 · Бизнес-логика» §3.5).
 * @param {Object} enrollment
 * @param {Object} group
 * @param {string} month "yyyy-MM"
 * @param {string[]} [holidays]
 * @returns {{amount: number, lessonsCount: number}}
 */
export function computeMonthlyChargeAmount(enrollment, group, month, holidays = []) {
  const [year, m] = month.split('-').map(Number);
  const monthStart = new Date(year, m - 1, 1);
  const monthEnd = new Date(year, m, 0);

  if (enrollment.status === 'paused' && enrollment.pausedFrom) {
    const pausedFrom = enrollment.pausedFrom.toDate();
    const pausedTo = enrollment.pausedTo ? enrollment.pausedTo.toDate() : monthEnd;

    if (pausedFrom <= monthStart && pausedTo >= monthEnd) {
      return { amount: 0, lessonsCount: 0 };
    }

    let lessonsCount = 0;
    if (pausedFrom > monthStart) lessonsCount += lessonsInRange(group.schedule, monthStart, subDays(pausedFrom, 1), holidays);
    if (pausedTo < monthEnd) lessonsCount += lessonsInRange(group.schedule, addDays(pausedTo, 1), monthEnd, holidays);

    return { amount: -Math.round(pricePerLesson(enrollment, group) * lessonsCount), lessonsCount };
  }

  return { amount: -enrollment.price, lessonsCount: group.lessonsPerMonth };
}

/**
 * Ежемесячное списание одной записи — вызывается из биллинг-рана.
 * Идемпотентно по тому же ID, что и частичное списание при активации —
 * если запись уже была списана в этом месяце (partial или monthly), вторая
 * запись не создаётся.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{student: Object, enrollment: Object, group: Object, month: string, holidays?: string[]}} ctx
 * @param {{uid: string, fullName: string}} user
 * @returns {Promise<string|null>}
 */
export async function chargeMonthly(db, { student, enrollment, group, month, holidays = [] }, user) {
  const txId = `charge_${enrollment.id}_${month}`;
  const existing = await getDoc(doc(db, 'transactions', txId));
  if (existing.exists()) return null;

  const { amount, lessonsCount } = computeMonthlyChargeAmount(enrollment, group, month, holidays);
  if (amount === 0) {
    await updateDoc(doc(db, 'enrollments', enrollment.id), { lastChargedMonth: month });
    return null;
  }

  const [year, m] = month.split('-').map(Number);
  const monthStart = new Date(year, m - 1, 1);
  const monthEnd = new Date(year, m, 0);

  await writeTransaction(db, {
    id: txId,
    branchId: group.branchId,
    studentId: student.id,
    studentName: student.fullName,
    enrollmentId: enrollment.id,
    groupId: group.id,
    groupCode: group.code,
    teacherId: group.teacherId,
    teacherName: group.teacherName,
    type: 'charge',
    amount,
    method: null,
    date: Timestamp.fromDate(monthStart),
    month,
    comment: `Оплата за ${format(monthStart, 'yyyy-MM')}`,
    periodFrom: Timestamp.fromDate(monthStart),
    periodTo: Timestamp.fromDate(monthEnd),
    lessonsCount,
    createdBy: user.uid,
    createdByName: user.fullName,
  });

  await updateDoc(doc(db, 'enrollments', enrollment.id), { lastChargedMonth: month });
  return txId;
}

/**
 * Оплата — «Добавить оплату» в карточке студента.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{student: Object, branchId: string, amount: number, method: string, date: Date, comment?: string, groupId?: string, groupCode?: string}} ctx
 * @param {{uid: string, fullName: string}} user
 * @returns {Promise<string>}
 */
export async function recordPayment(db, { student, branchId, amount, method, date, comment, groupId, groupCode }, user) {
  const txId = await writeTransaction(db, {
    branchId,
    studentId: student.id,
    studentName: student.fullName,
    enrollmentId: null,
    groupId: groupId ?? null,
    groupCode: groupCode ?? null,
    teacherId: null,
    teacherName: null,
    type: 'payment',
    amount: Math.abs(amount),
    method,
    date: Timestamp.fromDate(date),
    month: format(date, 'yyyy-MM'),
    comment: comment ?? '',
    periodFrom: null,
    periodTo: null,
    lessonsCount: null,
    createdBy: user.uid,
    createdByName: user.fullName,
  });

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
    await updateDoc(doc(db, 'students', student.id), { firstPaymentAt: serverTimestamp(), updatedAt: serverTimestamp(), ...wonFields });
  }
  return txId;
}

/**
 * Оплата учебных материалов (книги и т.п.) — разовый платёж, не долг за
 * курс: не трогает student.balance/lastPaymentAt/firstPaymentAt, не двигает
 * воронку лида. Попадает в transactions (affectsBalance:false) и в общую
 * выручку (monthlyRevenue/список платежей в «Финансы») — реальные деньги,
 * просто не про обучение. См. lib/billing.js writeTransaction.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{student: Object, branchId: string, amount: number, method: string, date: Date, comment?: string}} ctx
 * @param {{uid: string, fullName: string}} user
 * @returns {Promise<string>}
 */
export async function recordMaterialPayment(db, { student, branchId, amount, method, date, comment }, user) {
  return writeTransaction(db, {
    branchId,
    studentId: student.id,
    studentName: student.fullName,
    enrollmentId: null,
    groupId: null,
    groupCode: null,
    teacherId: null,
    teacherName: null,
    type: 'payment',
    category: 'materials',
    affectsBalance: false,
    amount: Math.abs(amount),
    method,
    date: Timestamp.fromDate(date),
    month: format(date, 'yyyy-MM'),
    comment: comment ?? '',
    periodFrom: null,
    periodTo: null,
    lessonsCount: null,
    createdBy: user.uid,
    createdByName: user.fullName,
  });
}

/**
 * Ручное списание — только `owner`/`accountant`.
 * @param {import('firebase/firestore').Firestore} db
 * @param {{student: Object, branchId: string, amount: number, comment: string, date: Date}} ctx
 * @param {{uid: string, fullName: string}} user
 * @returns {Promise<string>}
 */
export async function recordManualCharge(db, { student, branchId, amount, comment, date }, user) {
  return writeTransaction(db, {
    branchId,
    studentId: student.id,
    studentName: student.fullName,
    enrollmentId: null,
    groupId: null,
    groupCode: null,
    teacherId: null,
    teacherName: null,
    type: 'charge',
    amount: -Math.abs(amount),
    method: null,
    date: Timestamp.fromDate(date),
    month: format(date, 'yyyy-MM'),
    comment: comment || 'Ручное списание',
    periodFrom: null,
    periodTo: null,
    lessonsCount: null,
    createdBy: user.uid,
    createdByName: user.fullName,
  });
}

/**
 * Правит транзакцию на месте (сумма/комментарий/дата) — без компенсирующих
 * записей. Откатывает старый вклад и применяет новый к `students.balance`,
 * `monthlyBalances` (обеих месяцев, если дата переехала в другой месяц) и,
 * для type=payment, `monthlyRevenue`.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} original исходная транзакция
 * @param {{amount: number, comment: string, date: Date}} patch
 * @param {{uid: string}} user
 * @returns {Promise<void>}
 */
export async function updateTransaction(db, original, { amount, comment, date }, user) {
  const month = format(date, 'yyyy-MM');
  const delta = amount - original.amount;
  const batch = writeBatch(db);

  batch.update(doc(db, 'transactions', original.id), {
    amount,
    comment,
    date: Timestamp.fromDate(date),
    month,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });

  batch.update(doc(db, 'students', original.studentId), {
    balance: increment(delta),
    balanceUpdatedAt: serverTimestamp(),
  });

  const oldCharge = original.amount < 0 ? original.amount : 0;
  const oldPayment = original.amount > 0 ? original.amount : 0;
  const newCharge = amount < 0 ? amount : 0;
  const newPayment = amount > 0 ? amount : 0;

  if (month === original.month) {
    batch.set(
      doc(db, 'monthlyBalances', `${original.studentId}_${month}`),
      { charges: increment(newCharge - oldCharge), payments: increment(newPayment - oldPayment), balance: increment(delta), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } else {
    batch.set(
      doc(db, 'monthlyBalances', `${original.studentId}_${original.month}`),
      { charges: increment(-oldCharge), payments: increment(-oldPayment), balance: increment(-original.amount), updatedAt: serverTimestamp() },
      { merge: true },
    );
    batch.set(
      doc(db, 'monthlyBalances', `${original.studentId}_${month}`),
      { charges: increment(newCharge), payments: increment(newPayment), balance: increment(amount), updatedAt: serverTimestamp() },
      { merge: true },
    );
  }

  if (original.branchId && (oldPayment !== 0 || newPayment !== 0)) {
    if (month === original.month) {
      batch.set(
        doc(db, 'monthlyRevenue', `${original.branchId}_${month}`),
        { amount: increment(newPayment - oldPayment), paymentsCount: increment((newPayment !== 0) - (oldPayment !== 0)), updatedAt: serverTimestamp() },
        { merge: true },
      );
    } else {
      if (oldPayment !== 0) {
        batch.set(
          doc(db, 'monthlyRevenue', `${original.branchId}_${original.month}`),
          { amount: increment(-oldPayment), paymentsCount: increment(-1), updatedAt: serverTimestamp() },
          { merge: true },
        );
      }
      if (newPayment !== 0) {
        batch.set(
          doc(db, 'monthlyRevenue', `${original.branchId}_${month}`),
          { amount: increment(newPayment), paymentsCount: increment(1), updatedAt: serverTimestamp() },
          { merge: true },
        );
      }
    }
  }

  await batch.commit();
}

/**
 * Правит только способ оплаты — сумму/баланс/monthlyRevenue не трогает,
 * метод оплаты ни на один из агрегатов не влияет, в отличие от
 * `updateTransaction` (та про сумму/дату).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} transactionId
 * @param {string} method 'cash'|'uzcard'|'click'
 * @param {{uid: string}} user
 * @returns {Promise<void>}
 */
export async function updateTransactionMethod(db, transactionId, method, user) {
  await updateDoc(doc(db, 'transactions', transactionId), {
    method,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

/**
 * Удаляет транзакцию навсегда (любой type) — без компенсирующей записи.
 * Откатывает эффект на `students.balance`, `monthlyBalances` и (для
 * type=payment) `monthlyRevenue` тем же батчем.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} original исходная транзакция
 * @returns {Promise<void>}
 */
export async function deleteTransaction(db, original) {
  const { id, studentId, amount, month, type, branchId, affectsBalance = true } = original;
  const batch = writeBatch(db);

  batch.delete(doc(db, 'transactions', id));

  if (studentId && affectsBalance) {
    batch.update(doc(db, 'students', studentId), {
      balance: increment(-amount),
      balanceUpdatedAt: serverTimestamp(),
    });

    batch.set(
      doc(db, 'monthlyBalances', `${studentId}_${month}`),
      {
        charges: increment(amount < 0 ? -amount : 0),
        payments: increment(amount > 0 ? -amount : 0),
        balance: increment(-amount),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  if (type === 'payment' && branchId) {
    batch.set(
      doc(db, 'monthlyRevenue', `${branchId}_${month}`),
      {
        amount: increment(-amount),
        paymentsCount: increment(-1),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

/**
 * «Пересчитать баланс» — пересуммирует все транзакции студента и чинит
 * расхождение денормализованного `students.balance`.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} studentId
 * @returns {Promise<number>} пересчитанный баланс
 */
export async function recalcBalance(db, studentId) {
  const snap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', studentId)));
  // affectsBalance отсутствует на старых транзакциях (до введения оплаты
  // материалов) — трактуем как true, исключаем только явное false.
  const total = snap.docs
    .filter((d) => d.data().affectsBalance !== false)
    .reduce((sum, d) => sum + d.data().amount, 0);
  await updateDoc(doc(db, 'students', studentId), { balance: total, balanceUpdatedAt: serverTimestamp() });
  return total;
}

/**
 * ID документа биллинг-рана — `{branchId}_{YYYY-MM}`, тот же месяц не
 * начисляется дважды: если ран уже `done`, второй вызов ничего не делает.
 * @param {string} branchId
 * @param {string} month
 * @returns {string}
 */
export function billingRunId(branchId, month) {
  return `${branchId}_${month}`;
}

/**
 * Читает текущий биллинг-ран филиала за месяц (для баннера в топбаре).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {string} month
 * @returns {Promise<Object|null>}
 */
export async function getBillingRun(db, branchId, month) {
  const snap = await getDoc(doc(db, 'billingRuns', billingRunId(branchId, month)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Биллинг-ран без бэкенда — «03 · Бизнес-логика» §3.4. Начисляет текущий
 * месяц по каждой активной записи филиала, у которой `lastChargedMonth`
 * ещё не равен этому месяцу. Идемпотентно дважды: и по ID `billingRuns`
 * (повторный вызов при `status: 'done'` — no-op), и по ID каждой транзакции
 * списания (см. `chargeMonthly`).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {{uid: string, fullName: string}} user
 * @param {string[]} [holidays]
 * @returns {Promise<{processed: number, totalAmount: number, errors: string[], skipped: boolean}>}
 */
export async function runMonthlyBilling(db, branchId, user, holidays = []) {
  const month = format(new Date(), 'yyyy-MM');
  const runRef = doc(db, 'billingRuns', billingRunId(branchId, month));

  // Атомарный «захват» рана — без этого два почти одновременных клика (ceo
  // и manager, оба видят ещё не done/running) оба проходят проверку и оба
  // начинают начислять: у транзакций один и тот же ID, но students.balance
  // получает increment(amount) из каждого batch отдельно — двойное списание
  // с баланса при одной видимой транзакции. runTransaction читает и пишет
  // billingRuns одной атомарной операцией — выигрывает только один вызов.
  // Если ран завис в 'running' дольше STALE_RUN_MS (упала вкладка/сеть до
  // финального updateDoc в status: 'done') — считаем брошенным, разрешаем
  // перезахват. Настоящий одновременный клик такого разрыва не даёт —
  // startedAt будет свежим, вторая попытка упрётся в !isStale.
  const STALE_RUN_MS = 5 * 60 * 1000;

  const claimed = await runTransaction(db, async (tx) => {
    const snap = await tx.get(runRef);
    if (snap.exists()) {
      const data = snap.data();
      if (data.status === 'done') return false;
      if (data.status === 'running') {
        const isStale = Date.now() - (data.startedAt?.toMillis?.() ?? 0) > STALE_RUN_MS;
        if (!isStale) return false;
      }
    }
    tx.set(
      runRef,
      { branchId, month, status: 'running', startedAt: serverTimestamp(), finishedAt: null, processed: 0, errors: [] },
      { merge: true },
    );
    return true;
  });

  if (!claimed) {
    const current = await getDoc(runRef);
    return { processed: current.data()?.processed ?? 0, totalAmount: 0, errors: [], skipped: true };
  }

  const enrollSnap = await getDocs(
    query(collection(db, 'enrollments'), where('branchId', '==', branchId), where('status', '==', 'active')),
  );
  const enrollments = enrollSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((e) => e.lastChargedMonth !== month);

  let processed = 0;
  let totalAmount = 0;
  const errors = [];

  for (const enrollment of enrollments) {
    try {
      // eslint-disable-next-line no-await-in-loop -- начисление по записям идёт последовательно, не пачками запросов
      const [groupSnap, studentSnap] = await Promise.all([
        getDoc(doc(db, 'groups', enrollment.groupId)),
        getDoc(doc(db, 'students', enrollment.studentId)),
      ]);
      if (!groupSnap.exists() || !studentSnap.exists()) continue;

      const group = { id: groupSnap.id, ...groupSnap.data() };
      const student = { id: studentSnap.id, ...studentSnap.data() };

      // eslint-disable-next-line no-await-in-loop
      const txId = await chargeMonthly(db, { student, enrollment, group, month, holidays }, user);
      if (txId) {
        processed += 1;
        totalAmount += Math.abs(enrollment.price);
      }
    } catch (err) {
      errors.push(`${enrollment.studentName ?? enrollment.id}: ${err.message}`);
    }
  }

  await updateDoc(runRef, { status: 'done', finishedAt: serverTimestamp(), processed, errors });
  return { processed, totalAmount, errors, skipped: false };
}
