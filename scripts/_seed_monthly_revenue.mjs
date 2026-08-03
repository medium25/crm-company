/**
 * Восстанавливает monthlyRevenue: для 02-07.2026 пересчитывает точно из
 * реальных transactions (у нас есть полные данные modme), для более ранних
 * месяцев (09.2017-01.2026) — берёт готовые суммы из графика modme (Total
 * Revenue chart на Finance-странице modme, снято через Vue $data.lineChar) —
 * сырых платёжных записей за эти месяцы у нас нет и не будет (решение
 * пользователя: перенос платежей только с 01.02.2026).
 *
 *   node --env-file=.env scripts/_seed_monthly_revenue.mjs
 */
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const BRANCH_ID = 'icon-main';
const REAL_MONTHS = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const batch1 = writeBatch(db);

// 1. Реальные месяцы — точный пересчёт из transactions.
for (const month of REAL_MONTHS) {
  const snap = await getDocs(
    query(
      collection(db, 'transactions'),
      where('branchId', '==', BRANCH_ID),
      where('type', '==', 'payment'),
      where('month', '==', month),
    ),
  );
  let amount = 0;
  let paymentsCount = 0;
  snap.forEach((d) => {
    amount += d.data().amount;
    paymentsCount++;
  });
  batch1.set(
    doc(db, 'monthlyRevenue', `${BRANCH_ID}_${month}`),
    { branchId: BRANCH_ID, month, amount, paymentsCount, updatedAt: serverTimestamp() },
    { merge: false },
  );
  console.log(`${month}: amount=${amount.toLocaleString('ru-RU')} paymentsCount=${paymentsCount}`);
}
await batch1.commit();

// 2. Исторические месяцы — из графика modme (только сумма, без разбивки по платежам).
const chartData = JSON.parse(readFileSync('scripts/_modme_chart_data.json', 'utf8'));
let batch2 = writeBatch(db);
let n = 0;
let historicalWritten = 0;
for (const point of chartData) {
  const month = `${point.x.slice(0, 4)}-${point.x.slice(4, 6)}`;
  if (REAL_MONTHS.includes(month)) continue; // уже точно посчитано выше
  const amount = Math.round(point.y);
  batch2.set(
    doc(db, 'monthlyRevenue', `${BRANCH_ID}_${month}`),
    { branchId: BRANCH_ID, month, amount, paymentsCount: null, updatedAt: serverTimestamp() },
    { merge: false },
  );
  historicalWritten++;
  n++;
  if (n % 400 === 0) {
    await batch2.commit();
    batch2 = writeBatch(db);
  }
}
await batch2.commit();

console.log(`\nИсторических месяцев записано: ${historicalWritten}`);
process.exit(0);
