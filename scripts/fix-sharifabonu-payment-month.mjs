/**
 * Sharifabonu Ahrorjonova 990000 — при бэкафилле (backfill-paid-aug.mjs)
 * ошибочно датирована 01.08.2026. Сверка с /v1/replenishments (canonical
 * источник) показала: в старой системе платёж датирован 2026-07-31 —
 * это июльский платёж, не августовский, поэтому он не попал в список
 * замеченных июльских дублей (тот шёл по другому ключу) и не попал в
 * августовскую сверку по сумме — раскрылось только сейчас через
 * построчную сверку /v1/replenishments за август (79 записей, 51 686 000)
 * против нашего списка (82, 62 001 000).
 *
 *   node --env-file=.env scripts/fix-sharifabonu-payment-month.mjs           # dry-run
 *   node --env-file=.env scripts/fix-sharifabonu-payment-month.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { updateTransaction } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const TX_ID = '7SdnXrrN7Bl96wXhLdIX';
const STUDENT_ID = 'DSwmlBDYsc9sfGmJz3IT';

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
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const snap = await getDoc(doc(db, 'transactions', TX_ID));
  const original = { id: TX_ID, ...snap.data() };
  console.log('Текущее:', original.month, original.amount, original.studentName);
  console.log('Новая дата: 2026-07-31, month=2026-07, сумма без изменений');

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  await updateTransaction(
    db,
    { ...original, studentId: STUDENT_ID },
    { amount: original.amount, comment: original.comment, date: new Date('2026-07-31T12:00:00') },
    { uid: user.uid, fullName: 'Doniyor Shavkatov' },
  );
  console.log('Готово: перенесено в июль.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
