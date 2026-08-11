/**
 * Точечная сверка 4 студентов, где live-статус в старой системе разошёлся
 * с нашим (проверено сейчас, оба логина открыты):
 *  - Marjona Ungboyeva: у нас trial (R34), в старой уже active (активирована 01.08).
 *  - Shaxnur Axmedov, Sobirjonov Muhammadali: у нас есть только их СТАРЫЙ
 *    enrollment (I5, left, из backfill-left-active-group.mjs) — они не
 *    входили в august trial-список (old_trial.json), это отдельные люди,
 *    которых записали в новую группу I6 уже после моей сверки. Создаю
 *    недостающий active-enrollment.
 *  - Dinora Turdimurodova: у нас active (R4), в старой сейчас frozen —
 *    у нас статус не поспевает за реальностью, перевожу в paused.
 *
 *   node --env-file=.env scripts/fix-status-drift.mjs           # dry-run
 *   node --env-file=.env scripts/fix-status-drift.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, addDoc, updateDoc, increment, Timestamp, serverTimestamp } from 'firebase/firestore';
import { recomputeStudentAggregates } from '../src/lib/students.js';

const APPLY = process.argv.includes('--apply');
const BRANCH_ID = 'icon-main';
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', BRANCH_ID), where('code', '==', 'I6')));
  const groupI6 = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() };

  console.log('\nПлан:');
  console.log('  Marjona Ungboyeva: enrollment yyda5ZFRb5BPk2tavDcL trial -> active, activatedAt=2026-08-01, status=active');
  console.log('  Shaxnur Axmedov: создать enrollment I6 active, activatedAt=2026-08-06, status=active');
  console.log('  Sobirjonov Muhammadali: создать enrollment I6 active, activatedAt=2026-08-06, status=active');
  console.log('  Dinora Turdimurodova: enrollment f9YQ57TwqNmyEr5L342v active -> paused, status=paused');

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  // Marjona
  await updateDoc(doc(db, 'enrollments', 'yyda5ZFRb5BPk2tavDcL'), {
    status: 'active',
    statusLabel: 'Активен (Оплачивает обучение)',
    activatedAt: Timestamp.fromDate(new Date('2026-08-01T00:00:00')),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  await recomputeStudentAggregates(db, 'gKotsiRNFB1x1n87ihs1');
  console.log('Marjona обновлена.');

  // Shaxnur
  await addDoc(collection(db, 'enrollments'), {
    branchId: BRANCH_ID,
    studentId: 'zEBJ92rIE3Q9hJinfEr8',
    studentName: 'Shaxnur Axmedov',
    groupId: groupI6.id,
    groupCode: groupI6.code,
    courseName: groupI6.courseName,
    teacherId: groupI6.teacherId,
    teacherName: groupI6.teacherName,
    status: 'active',
    statusLabel: 'Активен (Оплачивает обучение)',
    price: 890000,
    discountPercent: 0,
    discountReason: '',
    addedAt: Timestamp.fromDate(new Date('2026-08-06T00:00:00')),
    activatedAt: Timestamp.fromDate(new Date('2026-08-06T00:00:00')),
    pausedFrom: null,
    pausedTo: null,
    leftAt: null,
    leftReason: null,
    lastChargedMonth: null,
    isArchived: false,
    createdAt: Timestamp.fromDate(new Date('2026-08-06T00:00:00')),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  await updateDoc(doc(db, 'groups', groupI6.id), { studentsCount: increment(1) });
  await recomputeStudentAggregates(db, 'zEBJ92rIE3Q9hJinfEr8');
  console.log('Shaxnur обновлён.');

  // Sobirjonov
  await addDoc(collection(db, 'enrollments'), {
    branchId: BRANCH_ID,
    studentId: 'VbMYKaEEDJYEUDqRG57M',
    studentName: 'Sobirjonov Muhammadali',
    groupId: groupI6.id,
    groupCode: groupI6.code,
    courseName: groupI6.courseName,
    teacherId: groupI6.teacherId,
    teacherName: groupI6.teacherName,
    status: 'active',
    statusLabel: 'Активен (Оплачивает обучение)',
    price: 890000,
    discountPercent: 0,
    discountReason: '',
    addedAt: Timestamp.fromDate(new Date('2026-08-06T00:00:00')),
    activatedAt: Timestamp.fromDate(new Date('2026-08-06T00:00:00')),
    pausedFrom: null,
    pausedTo: null,
    leftAt: null,
    leftReason: null,
    lastChargedMonth: null,
    isArchived: false,
    createdAt: Timestamp.fromDate(new Date('2026-08-06T00:00:00')),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  await updateDoc(doc(db, 'groups', groupI6.id), { studentsCount: increment(1) });
  await recomputeStudentAggregates(db, 'VbMYKaEEDJYEUDqRG57M');
  console.log('Sobirjonov обновлён.');

  // Dinora
  await updateDoc(doc(db, 'enrollments', 'f9YQ57TwqNmyEr5L342v'), {
    status: 'paused',
    statusLabel: 'На паузе',
    pausedFrom: Timestamp.fromDate(new Date()),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  await recomputeStudentAggregates(db, 'tq3XpZ0lFJz2mPLlZZWN');
  console.log('Dinora обновлена.');

  console.log('\nГотово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
