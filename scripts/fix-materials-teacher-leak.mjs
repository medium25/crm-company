import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, query, where, writeBatch } from 'firebase/firestore';

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

// scripts/backfill-nogroup-payments.mjs (37e5a5c) фильтровал только
// type:'payment', не учёл category:'materials' — книги/материалы
// получили groupId/teacherId по единственному активному зачислению
// студента, хотя это деньги учебного центра, не курса, учителю с них
// процент не положен (см. recordMaterialPayment в billing.js — там
// teacherId/groupId всегда null по замыслу).
const snap = await getDocs(query(collection(db, 'transactions'), where('category', '==', 'materials')));
const batch = writeBatch(db);
let fixed = 0;
snap.forEach((d) => {
  const t = d.data();
  if (!t.teacherId && !t.groupId) return;
  batch.update(doc(db, 'transactions', d.id), { teacherId: null, teacherName: null, groupId: null, groupCode: null });
  fixed += 1;
});
if (fixed > 0) await batch.commit();
console.log(`Откачено material-оплат: ${fixed}`);
process.exit(0);
