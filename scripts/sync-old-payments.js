import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { recordPayment } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const BRANCH_ID = 'icon-main';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const staffUser = { uid: user.uid, fullName: 'Doniyor Shavkatov' };

const PAYMENTS = [
  { phone: '998992304605', name: 'Ibrohim Ismoilov', amount: 600000, method: 'click', group: 'R37', date: '2026-08-06' },
  { phone: '998700757556', name: 'Jahongir Vositov', amount: 800000, method: 'click', group: 'R5', date: '2026-08-06' },
];

const groupsSnap = await getDocs(collection(db, 'groups'));
const groupsByCode = new Map();
groupsSnap.forEach((d) => groupsByCode.set(d.data().code, { id: d.id, ...d.data() }));

for (const p of PAYMENTS) {
  const sSnap = await getDocs(query(collection(db, 'students'), where('phone', '==', p.phone)));
  if (sSnap.empty) { console.log(`${p.name}: не найден`); continue; }
  const student = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() };
  const group = groupsByCode.get(p.group);

  console.log(`${APPLY ? 'ПЛАТЁЖ' : 'dry-run'}: ${student.fullName} (было "${student.fullName}") ${p.amount} ${p.method} ${p.group} ${p.date}`);

  if (APPLY) {
    if (student.fullName !== p.name) {
      await updateDoc(doc(db, 'students', student.id), { fullName: p.name, updatedAt: serverTimestamp(), updatedBy: user.uid });
    }
    await recordPayment(
      db,
      {
        student,
        branchId: BRANCH_ID,
        amount: p.amount,
        method: p.method,
        date: new Date(`${p.date}T00:00:00`),
        comment: '',
        groupId: group?.id ?? null,
        groupCode: group?.code ?? null,
      },
      staffUser,
    );
  }
}
console.log(APPLY ? '\nГотово.' : '\ndry-run. Запусти с --apply.');
process.exit(0);
