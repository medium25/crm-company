/**
 * Финальная сверка 7 несовпавших августовских платежей:
 *  - Komila Egamberdiyeva, Aydin Adilova, Ismoil Turgunov: у нас дата на
 *    1-2 дня отличается от старой системы (метод/сумма совпадают) —
 *    просто поправляю дату транзакции.
 *  - Muhammad Xamidov, Munisa Norboyeva: метод оплаты не совпадает
 *    (uzcard/cash у нас vs click у них) — firestore.rules не разрешает
 *    менять method апдейтом, поэтому delete+recreate с тем же studentId/
 *    суммой/датой, только method другой.
 *  - Munisa Ammonova / Maftuna Ixtiyarova (901110045): пре-существующий
 *    дубль карточки (не мой) — R13, полностью задублированная история
 *    (июнь/июль платежи и начисления идентичны на обеих карточках).
 *    Архивная копия (s7NRymkldULmrmLBMkHO) уже isArchived=true, но её
 *    один реальный уникальный платёж (700000, 10.08, cash) не попал на
 *    актуальную карточку (BHR2rLneg7yefSwCypvG). У актуальной баланс
 *    уже верный (0, сверено с живым состоянием старой системы) — просто
 *    добавить платёж туда нельзя, задвоит. Переношу платёж +
 *    компенсирующая коррекция -700000, чтобы баланс остался 0, а история
 *    платежей (и, соответственно, сумма "Всего платежей") стала точной.
 *  - Kitob (тестовый аккаунт, не реальный студент) — не трогаю.
 *
 *   node --env-file=.env scripts/fix-remaining-7-payments.mjs           # dry-run
 *   node --env-file=.env scripts/fix-remaining-7-payments.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { updateTransaction, deleteTransaction, writeTransaction, recordPayment } from '../src/lib/billing.js';

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
  const staffUser = { uid: user.uid, fullName: 'Doniyor Shavkatov' };
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  console.log('\nПлан:');
  console.log('  Komila Egamberdiyeva: date 2026-08-05 -> 2026-08-04');
  console.log('  Aydin Adilova: date 2026-08-05 -> 2026-08-04');
  console.log('  Ismoil Turgunov: date 2026-08-05 -> 2026-08-03');
  console.log('  Muhammad Xamidov: method uzcard -> click (delete+recreate)');
  console.log('  Munisa Norboyeva: method cash -> click (delete+recreate)');
  console.log('  Munisa Ammonova: перенос платежа 700000 с дубля + коррекция -700000 (баланс останется 0)');

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  // 1-3: даты
  const dateFixes = [
    { id: '6GcdILBClNE433MDni04', newDate: '2026-08-04' },
    { id: 'JZRfHYIkCU4f7l4UrmEL', newDate: '2026-08-04' },
    { id: 'VeJxvhB1lX8kFr1vFmda', newDate: '2026-08-03' },
  ];
  for (const f of dateFixes) {
    const snap = await getDoc(doc(db, 'transactions', f.id));
    const original = { id: f.id, ...snap.data() };
    await updateTransaction(db, original, { amount: original.amount, comment: original.comment ?? '', date: new Date(`${f.newDate}T12:00:00`) }, { uid: user.uid });
    console.log(`Дата поправлена: ${original.studentName}`);
  }

  // 4-5: методы (delete+recreate)
  const methodFixes = [
    { id: 'ujXP8bDO7oDR0CjAbz9r', newMethod: 'click' },
    { id: 'g9VAS2TYMU3wQH8yqgUu', newMethod: 'click' },
  ];
  for (const f of methodFixes) {
    const snap = await getDoc(doc(db, 'transactions', f.id));
    const original = { id: f.id, ...snap.data() };
    await deleteTransaction(db, original);
    await writeTransaction(db, {
      branchId: original.branchId,
      studentId: original.studentId,
      studentName: original.studentName,
      enrollmentId: original.enrollmentId ?? null,
      groupId: original.groupId ?? null,
      groupCode: original.groupCode ?? null,
      teacherId: original.teacherId ?? null,
      teacherName: original.teacherName ?? null,
      type: 'payment',
      amount: original.amount,
      method: f.newMethod,
      date: original.date.toDate(),
      month: original.month,
      comment: original.comment ?? '',
      periodFrom: null,
      periodTo: null,
      lessonsCount: null,
      createdBy: user.uid,
      createdByName: 'Doniyor Shavkatov',
    });
    console.log(`Метод поправлен: ${original.studentName}`);
  }

  // 6: перенос платежа Munisa Ammonova
  const dupTxSnap = await getDoc(doc(db, 'transactions', 'K6zEWz1G8iMCVf0xFYqa'));
  const dupTx = { id: 'K6zEWz1G8iMCVf0xFYqa', ...dupTxSnap.data() };
  await deleteTransaction(db, dupTx);

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', BRANCH_ID), where('code', '==', 'R13')));
  const group = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() };
  const correctStudentSnap = await getDoc(doc(db, 'students', 'BHR2rLneg7yefSwCypvG'));
  const correctStudent = { id: 'BHR2rLneg7yefSwCypvG', ...correctStudentSnap.data() };

  await recordPayment(
    db,
    { student: correctStudent, branchId: BRANCH_ID, amount: 700000, method: 'cash', date: dupTx.date.toDate(), comment: '', groupId: group.id, groupCode: group.code },
    staffUser,
  );
  await writeTransaction(db, {
    branchId: BRANCH_ID,
    studentId: correctStudent.id,
    studentName: correctStudent.fullName,
    enrollmentId: null,
    groupId: null,
    groupCode: null,
    teacherId: null,
    teacherName: null,
    type: 'correction',
    amount: -700000,
    method: null,
    date: new Date(),
    month: new Date().toISOString().slice(0, 7),
    comment: 'Перенос платежа с дубль-карточки (901110045, ранее числился на Maftuna Ixtiyarova) + компенсация, баланс не меняется',
    periodFrom: null,
    periodTo: null,
    lessonsCount: null,
    createdBy: user.uid,
    createdByName: 'Doniyor Shavkatov',
  });
  console.log('Munisa Ammonova: платёж перенесён, баланс скомпенсирован.');

  console.log('\nГотово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
