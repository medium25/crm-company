/**
 * Mahliyo Xasanova была добавлена как студентка (add-missing-active-student.mjs)
 * без платежа. В канонической выгрузке /v1/replenishments за август у неё
 * есть платёж 840000 (07.08.2026) — дописываю.
 *
 *   node --env-file=.env scripts/add-mahliyo-payment.mjs           # dry-run
 *   node --env-file=.env scripts/add-mahliyo-payment.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { recordPayment } from '../src/lib/billing.js';

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

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('branchId', '==', BRANCH_ID), where('phone', '==', '998940288807')));
  if (studentsSnap.empty) {
    console.log('СТОП: студент не найден');
    process.exit(1);
  }
  const student = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', BRANCH_ID), where('code', '==', 'R32')));
  const group = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() };

  console.log(`Оплата: ${student.fullName} 840000 cash 2026-08-07`);

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  await recordPayment(
    db,
    { student, branchId: BRANCH_ID, amount: 840000, method: 'cash', date: new Date('2026-08-07T12:00:00'), comment: '', groupId: group.id, groupCode: group.code },
    staffUser,
  );
  console.log('Готово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
