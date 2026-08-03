/**
 * monthlyRevenue — предпосчитанный агрегат для графика выручки (дашборд +
 * страница «Все платежи»). Обновляется только через writeTransaction() —
 * все мои сырые batch-записи в этой сессии (делта-миграция, коррекции
 * баланса) его не трогали. Пересчитываем 2026-07 и 2026-08 напрямую из
 * transactions (единственные месяцы, где что-то менялось в этой сессии).
 *
 *   node --env-file=.env scripts/_fix_monthly_revenue.mjs
 */
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

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const branchId = 'icon-main';
  const months = ['2026-07', '2026-08'];
  const batch = writeBatch(db);

  for (const month of months) {
    const txSnap = await getDocs(
      query(
        collection(db, 'transactions'),
        where('branchId', '==', branchId),
        where('type', '==', 'payment'),
        where('month', '==', month),
      ),
    );
    let amount = 0;
    txSnap.forEach((d) => { amount += d.data().amount; });
    const count = txSnap.size;
    batch.set(
      doc(db, 'monthlyRevenue', `${branchId}_${month}`),
      { branchId, month, amount, paymentsCount: count, updatedAt: serverTimestamp() },
      { merge: false },
    );
    console.log(month, '-> amount=', amount, 'count=', count);
  }

  await batch.commit();
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
