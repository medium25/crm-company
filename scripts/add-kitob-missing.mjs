/**
 * Реальная карточка Kitob (juNXAaPJv8opPhqMcOSP) — 2 новых платежа
 * (08-11, Cash, 55000 каждый) появились в старой системе уже после
 * предыдущей сверки, добавляю чтобы сошлось.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { recordPayment } from '../src/lib/billing.js';

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
  const snap = await getDoc(doc(db, 'students', 'juNXAaPJv8opPhqMcOSP'));
  const student = { id: 'juNXAaPJv8opPhqMcOSP', ...snap.data() };

  for (let i = 0; i < 2; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await recordPayment(db, { student, branchId: 'icon-main', amount: 55000, method: 'cash', date: new Date('2026-08-11T12:00:00'), comment: '', groupId: null, groupCode: null }, staffUser);
  }
  console.log('Готово: +2 платежа по 55000.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
