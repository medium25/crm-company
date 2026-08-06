import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';
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
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const phones = ['998501046557', '998883930705', '998700757556'];

for (const phone of phones) {
  const sSnap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  if (sSnap.empty) { console.log(`${phone}: не найден`); continue; }
  const student = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() };

  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', student.id)));
  for (const d of txSnap.docs) {
    const t = d.data();
    if (t.studentName === student.fullName) continue; // уже верно

    console.log(`${APPLY ? 'ПЕРЕСОЗДАНИЕ' : 'dry-run'}: "${t.studentName}" -> "${student.fullName}"  ${t.type} ${t.amount} ${t.month}`);

    if (APPLY) {
      await deleteDoc(doc(db, 'transactions', d.id));
      await writeTransaction(db, {
        branchId: t.branchId,
        studentId: t.studentId,
        studentName: student.fullName,
        enrollmentId: t.enrollmentId ?? null,
        groupId: t.groupId ?? null,
        groupCode: t.groupCode ?? null,
        teacherId: t.teacherId ?? null,
        teacherName: t.teacherName ?? null,
        type: t.type,
        amount: t.amount,
        method: t.method ?? null,
        date: t.date.toDate(),
        month: t.month,
        comment: t.comment ?? '',
        periodFrom: t.periodFrom ? t.periodFrom.toDate() : null,
        periodTo: t.periodTo ? t.periodTo.toDate() : null,
        lessonsCount: t.lessonsCount ?? null,
        createdBy: t.createdBy,
        createdByName: t.createdByName,
      });
    }
  }

  if (APPLY) {
    const bal = await recalcBalance(db, student.id);
    console.log(`  -> баланс пересчитан: ${bal} (ожидается ${student.balance})`);
  }
}
console.log(APPLY ? '\nГотово.' : '\ndry-run.');
process.exit(0);
