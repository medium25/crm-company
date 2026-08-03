/**
 * monthlyBalances/{studentId}_{month} — то же самое, что monthlyRevenue, но
 * по студентам (используется на StudentDetailPage, «Статус баланса за
 * месяц»). Мои сырые batch-записи в этой сессии его не обновляли.
 * Пересчитываем 2026-07 и 2026-08 напрямую из transactions (единственные
 * месяцы, тронутые в этой сессии) — SET, не increment, чтобы не задвоить.
 *
 *   node --env-file=.env scripts/_fix_monthly_balances.mjs
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

  const months = ['2026-07', '2026-08'];
  let batch = writeBatch(db);
  let n = 0;
  let totalDocs = 0;

  for (const month of months) {
    const txSnap = await getDocs(query(collection(db, 'transactions'), where('month', '==', month)));
    const byStudent = new Map();
    txSnap.forEach((d) => {
      const t = d.data();
      const cur = byStudent.get(t.studentId) ?? { charges: 0, payments: 0, balance: 0 };
      if (t.amount < 0) cur.charges += t.amount;
      else cur.payments += t.amount;
      cur.balance += t.amount;
      byStudent.set(t.studentId, cur);
    });

    for (const [studentId, agg] of byStudent) {
      batch.set(
        doc(db, 'monthlyBalances', `${studentId}_${month}`),
        { studentId, month, ...agg, updatedAt: serverTimestamp() },
        { merge: false },
      );
      n++;
      totalDocs++;
      if (n % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    console.log(month, '-> студентов:', byStudent.size);
  }
  await batch.commit();
  console.log('Готово. Всего документов monthlyBalances пересчитано:', totalDocs);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
