import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { writeTransaction, recalcBalance } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const staffUser = { uid: user.uid, fullName: 'Doniyor Shavkatov' };

const sSnap = await getDocs(query(collection(db, 'students'), where('phone', '==', '998940208150')));
const studentId = sSnap.docs[0].id;
const groupsSnap = await getDocs(query(collection(db, 'groups'), where('code', '==', 'R37')));
const group = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() };

const CHARGES = [
  { amount: -140000, month: '2026-06', date: '2026-06-18', lessons: 6, creator: 'Mr Abduganiev' },
  { amount: -840000, month: '2026-07', date: '2026-07-02', lessons: 13, creator: null },
];

for (const c of CHARGES) {
  console.log(`${APPLY ? 'ДОБАВЛЕНИЕ' : 'dry-run'}: charge ${c.amount} ${c.month} R37 ${c.date} by=${c.creator ?? 'система'}`);
  if (APPLY) {
    await writeTransaction(db, {
      branchId: 'icon-main',
      studentId,
      studentName: "Ulug'bek Raimqulov",
      enrollmentId: null,
      groupId: group.id,
      groupCode: 'R37',
      teacherId: group.teacherId ?? null,
      teacherName: group.teacherName ?? null,
      type: 'charge',
      amount: c.amount,
      method: null,
      date: new Date(`${c.date}T00:00:00`),
      month: c.month,
      comment: `${c.lessons} ур. (перенос из старой системы${c.creator ? `, ${c.creator}` : ''})`,
      periodFrom: null,
      periodTo: null,
      lessonsCount: c.lessons,
      createdBy: staffUser.uid,
      createdByName: c.creator ?? 'система',
    });
  }
}
if (APPLY) {
  const bal = await recalcBalance(db, studentId);
  console.log('пересчитан баланс:', bal, '(ожидается -1620000)');
}
console.log(APPLY ? '\nГотово.' : '\ndry-run.');
process.exit(0);
