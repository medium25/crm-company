/**
 * Одноразовая починка: `monthlyRevenue` (агрегат, который кормит графики
 * выручки) разошёлся с реальными `transactions` за апрель/июнь/июль/август
 * 2026 — платежи явно удаляли в обход `deleteTransaction` (который обязан
 * уменьшать агрегат тем же батчем), и он остался задран на удалённые суммы.
 * Обнаружено при сверке с экспортом из старой системы (icon.modme.uz):
 * реальная сумма за июль (125 600 385) совпала с ней и с live-подсчётом на
 * странице «Все платежи» — расходился только закешированный агрегат.
 *
 * Пересчитывает monthlyRevenue строго из суммы payment-транзакций месяца —
 * только для месяцев, где такие транзакции реально есть (после перехода на
 * эту систему). Более старые месяцы (2017–2026-01) сюда не входят — там
 * monthlyRevenue хранит исторические суммы, перенесённые из старой системы
 * без построчных транзакций, это не баг синхронизации, трогать не надо.
 *
 *   node --env-file=.env scripts/fix-monthly-revenue-drift.js
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDoc, getDocs, query, where, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const BRANCH_ID = 'icon-main';
// Только месяцы, где сверка нашла реальную разницу между транзакциями и
// агрегатом (не вся история — см. комментарий выше).
const MONTHS = ['2026-04', '2026-06', '2026-07', '2026-08'];

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Нужны SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD в .env');
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  const batch = writeBatch(db);
  for (const month of MONTHS) {
    // eslint-disable-next-line no-await-in-loop -- по месяцам, их всего 4
    const snap = await getDocs(
      query(
        collection(db, 'transactions'),
        where('branchId', '==', BRANCH_ID),
        where('type', '==', 'payment'),
        where('month', '==', month),
      ),
    );
    const amount = snap.docs.reduce((sum, d) => sum + d.data().amount, 0);
    const paymentsCount = snap.size;

    const aggRef = doc(db, 'monthlyRevenue', `${BRANCH_ID}_${month}`);
    // eslint-disable-next-line no-await-in-loop
    const aggSnap = await getDoc(aggRef);
    const before = aggSnap.data();

    console.log(
      `${month}: агрегат ${before?.amount} (${before?.paymentsCount}) -> ${amount} (${paymentsCount}), реальных транзакций: ${snap.size}`,
    );

    batch.update(aggRef, { amount, paymentsCount, updatedAt: serverTimestamp(), updatedBy: user.uid });
  }

  await batch.commit();
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
