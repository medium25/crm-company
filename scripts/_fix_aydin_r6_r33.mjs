/**
 * Aydin Adilova перешла из R6 в R33 в modme 31.07.2026 — тот же случай, что
 * и Zubayr Ahromov (R3->R4). Phase 1 захватил её ещё в R6.
 *
 *   node --env-file=.env scripts/_fix_aydin_r6_r33.mjs
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

  const studentSnap = await getDocs(query(collection(db, 'students'), where('fullName', '==', 'Aydin Adilova')));
  const student = studentSnap.docs[0];
  const studentId = student.id;
  const currentBalance = student.data().balance;
  const targetBalance = -900000;

  const r6Snap = await getDocs(query(collection(db, 'groups'), where('code', '==', 'R6')));
  const r6 = r6Snap.docs[0];
  const r33Snap = await getDocs(query(collection(db, 'groups'), where('code', '==', 'R33')));
  const r33 = r33Snap.docs[0];

  const oldEnrollSnap = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', studentId), where('groupId', '==', r6.id)));
  const oldEnroll = oldEnrollSnap.docs[0];

  const batch = writeBatch(db);

  batch.update(doc(db, 'enrollments', oldEnroll.id), {
    status: 'left',
    statusLabel: 'Перевёлся в другую группу',
    leftAt: ts('2026-07-31'),
    leftReason: 'Перевод в R33',
    isArchived: true,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });

  const newEnrollRef = doc(collection(db, 'enrollments'));
  batch.set(newEnrollRef, {
    id: newEnrollRef.id,
    branchId: 'icon-main',
    studentId,
    studentName: 'Aydin Adilova',
    groupId: r33.id,
    groupCode: 'R33',
    courseName: r33.data().courseName,
    teacherId: r33.data().teacherId,
    teacherName: r33.data().teacherName,
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

  const diff = targetBalance - currentBalance;
  if (diff !== 0) {
    const txRef = doc(collection(db, 'transactions'));
    batch.set(txRef, {
      id: txRef.id,
      branchId: 'icon-main',
      studentId,
      studentName: 'Aydin Adilova',
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
      comment: 'Коррекция баланса — перевод R6->R33, сверка с modme',
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
    balance: targetBalance,
    activeGroupsCount: 1,
    balanceUpdatedAt: serverTimestamp(),
  });

  batch.update(doc(db, 'groups', r6.id), { studentsCount: increment(-1) });
  batch.update(doc(db, 'groups', r33.id), { studentsCount: increment(1) });

  await batch.commit();
  console.log('Готово. Aydin Adilova: R6 -> R33, balance ->', targetBalance);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
