/**
 * Boburbek Sultonov — у нас начислен август (bulk-начисление затронуло всех
 * активных сразу), а в modme его индивидуальный цикл начисления на момент
 * сверки ещё не наступил. Реверс, как и по 13 студентам ранее.
 *
 *   node --env-file=.env scripts/_fix_boburbek_20260802.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

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
  const uid = user.uid;

  const snap = await getDocs(query(collection(db, 'students'), where('fullName', '==', 'Boburbek Sultonov')));
  const s = snap.docs[0];
  if (!s) throw new Error('Не найден');

  const batch = writeBatch(db);
  const txRef = doc(collection(db, 'transactions'));
  batch.set(txRef, {
    id: txRef.id,
    branchId: 'icon-main',
    studentId: s.id,
    studentName: 'Boburbek Sultonov',
    enrollmentId: null,
    groupId: null,
    groupCode: null,
    teacherId: null,
    teacherName: null,
    type: 'correction',
    amount: 840000,
    method: null,
    date: serverTimestamp(),
    month: '2026-08',
    comment: 'Реверс августовского начисления — в modme индивидуальный цикл начисления ещё не наступил на момент сверки',
    periodFrom: null,
    periodTo: null,
    lessonsCount: null,
    createdBy: uid,
    createdByName: 'Система (миграция)',
    createdAt: serverTimestamp(),
    isReversed: false,
    reversedBy: null,
  });
  batch.update(doc(db, 'students', s.id), { balance: increment(840000), balanceUpdatedAt: serverTimestamp() });
  await batch.commit();
  console.log('Готово. Boburbek Sultonov balance +840000');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
