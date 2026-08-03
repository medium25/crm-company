/**
 * Zubayr Ahromov перешёл из R3 в R4 в modme 31.07.2026 (видно в его истории
 * платежей) — Phase 1 захватил его ещё в R3, перенос группы не отследили.
 * Плюс баланс разошёлся из-за сложной истории списаний (индивидуальные
 * скидки/уроки) — корректируем до текущего значения в modme (0 UZS).
 * R3 в modme теперь архивная группа с 0 студентов — архивируем и у нас.
 *
 *   node --env-file=.env scripts/_fix_zubayr_r3_r4.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, serverTimestamp, increment, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

function ts(dateStr) {
  return Timestamp.fromDate(new Date(`${dateStr}T00:00:00`));
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const studentSnap = await getDocs(query(collection(db, 'students'), where('fullName', '==', 'Zubayr Ahromov')));
  const student = studentSnap.docs[0];
  const studentId = student.id;
  const currentBalance = student.data().balance;

  const r3Snap = await getDocs(query(collection(db, 'groups'), where('code', '==', 'R3')));
  const r3 = r3Snap.docs[0];
  const r4Snap = await getDocs(query(collection(db, 'groups'), where('code', '==', 'R4')));
  const r4 = r4Snap.docs[0];

  const oldEnrollSnap = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', studentId), where('groupId', '==', r3.id)));
  const oldEnroll = oldEnrollSnap.docs[0];

  const batch = writeBatch(db);

  // 1. Архивируем старое зачисление в R3
  batch.update(doc(db, 'enrollments', oldEnroll.id), {
    status: 'left',
    statusLabel: 'Перевёлся в другую группу',
    leftAt: ts('2026-07-31'),
    leftReason: 'Перевод в R4',
    isArchived: true,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });

  // 2. Новое зачисление в R4
  const newEnrollRef = doc(collection(db, 'enrollments'));
  batch.set(newEnrollRef, {
    id: newEnrollRef.id,
    branchId: 'icon-main',
    studentId,
    studentName: 'Zubayr Ahromov',
    groupId: r4.id,
    groupCode: 'R4',
    courseName: r4.data().courseName,
    teacherId: r4.data().teacherId,
    teacherName: r4.data().teacherName,
    status: 'active',
    statusLabel: 'Активен (Оплачивает обучение)',
    price: 840000,
    discountPercent: 0,
    discountReason: '',
    addedAt: ts('2026-07-31'),
    activatedAt: ts('2026-07-31'),
    pausedFrom: null,
    pausedTo: null,
    leftAt: null,
    leftReason: null,
    lastChargedMonth: '2026-08',
    isArchived: false,
    createdBy: uid,
    createdAt: ts('2026-07-31'),
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });

  // 3. Коррекция баланса до текущего значения в modme (0)
  const diff = 0 - currentBalance;
  if (diff !== 0) {
    const txRef = doc(collection(db, 'transactions'));
    batch.set(txRef, {
      id: txRef.id,
      branchId: 'icon-main',
      studentId,
      studentName: 'Zubayr Ahromov',
      enrollmentId: null,
      groupId: null,
      groupCode: null,
      teacherId: null,
      teacherName: null,
      type: 'correction',
      amount: diff,
      method: null,
      date: serverTimestamp(),
      month: '2026-08',
      comment: 'Коррекция баланса — сложная история списаний (индивидуальные скидки) не переносилась, сверка с modme (0 UZS)',
      periodFrom: null,
      periodTo: null,
      lessonsCount: null,
      createdBy: uid,
      createdByName: 'Система (сверка)',
      createdAt: serverTimestamp(),
      isReversed: false,
      reversedBy: null,
    });
  }
  batch.update(doc(db, 'students', studentId), {
    balance: 0,
    activeGroupsCount: 1,
    balanceUpdatedAt: serverTimestamp(),
  });

  // 4. R3 архивируем (в modme архивная, 0 студентов), R4 +1
  batch.update(doc(db, 'groups', r3.id), {
    isArchived: true,
    status: 'archived',
    studentsCount: 0,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'groups', r4.id), { studentsCount: increment(1) });

  await batch.commit();
  console.log('Готово. Zubayr Ahromov: R3 -> R4, balance corrected to 0, R3 archived.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
