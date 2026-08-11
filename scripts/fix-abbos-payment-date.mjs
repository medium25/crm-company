/**
 * Abbos Baxtiyev 10 000 000 — в старой системе (icon.modme.uz) у этой
 * записи легаси-баг: поле `date`="2023-01-03" вместо реальной даты приёма
 * (03.08.2026, created_at подтверждает). Из-за этого их августовская
 * выручка (/v1/replenishments сумма) не включает эти деньги — 51 686 000
 * без него, 62 001 000 у нас с ним (в августе).
 *
 * По решению пользователя — копируем баг старой системы 1-в-1, чтобы
 * цифры дашборда совпадали: переносим дату на 2023-01-03 (месяц тоже
 * съезжает на 2023-01 — баланс студента не меняется, просто транзакция
 * уходит в другой отчётный период, как и в старой системе).
 *
 *   node --env-file=.env scripts/fix-abbos-payment-date.mjs           # dry-run
 *   node --env-file=.env scripts/fix-abbos-payment-date.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { updateTransaction } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const TX_ID = 'vDePt7OC8q2U3DpGs0LZ';
const STUDENT_ID = 'FXx2J01Hi9IJxo1a2qWz';

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
  console.log('Новая дата: 2023-01-03, month=2023-01, сумма без изменений');

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  await updateTransaction(
    db,
    { ...original, studentId: STUDENT_ID },
    { amount: original.amount, comment: original.comment, date: new Date('2023-01-03T12:00:00') },
    { uid: user.uid, fullName: 'Doniyor Shavkatov' },
  );
  console.log('Готово: перенесено на 2023-01-03 (как в старой системе).');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
