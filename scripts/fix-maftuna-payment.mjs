/**
 * Maftuna Fozilova не найдена среди августовских плательщиков — платёж
 * 840000 (10.08, cash, R33) в базе отсутствовал вообще (её баланс уже
 * был доведён до верного числа 1000 через lump-корректировку
 * fix-balance-corrections-aug.mjs, но без реальной транзакции платежа —
 * значит "оплатили в этом месяце" её не считал). Добавляю платёж +
 * компенсирующую коррекцию -840000, чтобы баланс остался 1000, а история
 * стала точной.
 *
 *   node --env-file=.env scripts/fix-maftuna-payment.mjs           # dry-run
 *   node --env-file=.env scripts/fix-maftuna-payment.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { recordPayment, writeTransaction } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const BRANCH_ID = 'icon-main';
const STUDENT_ID = 'RLBiXOaMHVfTZikwf6IU';
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

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', BRANCH_ID), where('code', '==', 'R33')));
  const group = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() };
  const studentSnap = await getDoc(doc(db, 'students', STUDENT_ID));
  const student = { id: STUDENT_ID, ...studentSnap.data() };

  console.log(`Платёж: ${student.fullName} 840000 cash 2026-08-10, R33; текущий баланс=${student.balance} (останется тем же после компенсации)`);

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  await recordPayment(
    db,
    { student, branchId: BRANCH_ID, amount: 840000, method: 'cash', date: new Date('2026-08-10T17:28:15'), comment: '', groupId: group.id, groupCode: group.code },
    staffUser,
  );

  await writeTransaction(db, {
    branchId: BRANCH_ID,
    studentId: STUDENT_ID,
    studentName: student.fullName,
    enrollmentId: null,
    groupId: null,
    groupCode: null,
    teacherId: null,
    teacherName: null,
    type: 'correction',
    amount: -840000,
    method: null,
    date: new Date(),
    month: new Date().toISOString().slice(0, 7),
    comment: 'Компенсация: платёж добавлен отдельной транзакцией поверх ранее сделанной lump-коррекции баланса',
    periodFrom: null,
    periodTo: null,
    lessonsCount: null,
    createdBy: user.uid,
    createdByName: 'Doniyor Shavkatov',
  });
  console.log('Готово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
