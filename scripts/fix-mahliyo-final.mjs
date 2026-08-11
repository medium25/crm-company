/**
 * Арифметика после fix-mahliyo-duplicate.mjs + fix-mahliyo-double-payment.mjs
 * разъехалась: коррекция -710769 была рассчитана в момент, когда на
 * карточке временно было 2 платежа по 840000 (дубль ещё не нашли),
 * позже дубль удалили (-840000), но коррекцию под новое состояние не
 * пересчитали. Итог: наш баланс -710769, реальный (старая система,
 * только что сверено) — 129230.77. Довожу корректирующей транзакцией.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { recordManualCharge, writeTransaction } from '../src/lib/billing.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const STUDENT_ID = 'JlmOaEpFGnCbWiNoNjEc';
const TARGET = 129231;

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const snap = await getDoc(doc(db, 'students', STUDENT_ID));
  const current = Math.round(snap.data().balance ?? 0);
  const correction = TARGET - current;
  console.log(`Текущий=${current}, целевой=${TARGET}, коррекция=${correction}`);

  await writeTransaction(db, {
    branchId: 'icon-main',
    studentId: STUDENT_ID,
    studentName: 'Mahliyo Xasanova',
    enrollmentId: null,
    groupId: null,
    groupCode: null,
    teacherId: null,
    teacherName: null,
    type: 'correction',
    amount: correction,
    method: null,
    date: new Date(),
    month: new Date().toISOString().slice(0, 7),
    comment: 'Сверка баланса со старой системой (icon.modme.uz) — исправление арифметики после удаления дубль-платежа',
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
