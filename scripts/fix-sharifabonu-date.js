/**
 * Правка даты одного платежа (Sharifabonu Ahrorjonova, 990 000 UZS) —
 * в новой системе стоит 01.08.2026, в старой системе (источник истины)
 * этот же платёж датирован 31.07.2026. Двигаем дату/месяц и синхронно
 * поправляем денормализованные агрегаты monthlyBalances и monthlyRevenue,
 * иначе дашборд/финансы за июль-август разъедутся с transactions.
 *
 * Без --apply — dry-run. С --apply — реально пишет.
 *
 *   node --env-file=.env scripts/fix-sharifabonu-date.js
 *   node --env-file=.env scripts/fix-sharifabonu-date.js --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const APPLY = process.argv.includes('--apply');
const OLD_MONTH = '2026-08';
const NEW_MONTH = '2026-07';
const NEW_DATE = new Date('2026-07-31T00:00:00');

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  const studentsSnap = await getDocs(
    query(collection(db, 'students'), where('phone', '==', '998909244141')),
  );
  if (studentsSnap.empty) throw new Error('Студент с телефоном 998909244141 не найден');
  const student = { id: studentsSnap.docs[0].id, ...studentsSnap.docs[0].data() };
  console.log(`Студент: ${student.fullName} (${student.id})`);

  const txSnap = await getDocs(
    query(collection(db, 'transactions'), where('studentId', '==', student.id), where('type', '==', 'payment')),
  );
  const target = txSnap.docs.find((d) => d.data().amount === 990000);
  if (!target) throw new Error('Платёж 990000 не найден среди транзакций студента');

  const tx = target.data();
  console.log('Текущая транзакция:', {
    id: target.id,
    amount: tx.amount,
    month: tx.month,
    date: tx.date?.toDate?.(),
  });

  if (tx.month !== OLD_MONTH) {
    console.log(`Месяц уже ${tx.month}, не ${OLD_MONTH} — похоже, уже исправлено. Стоп.`);
    return;
  }

  console.log(`${APPLY ? 'ПРАВКА' : 'dry-run'}: date -> ${NEW_DATE.toDateString()}, month -> ${NEW_MONTH}`);
  console.log(`  monthlyBalances: ${student.id}_${OLD_MONTH}.payments -990000, ${student.id}_${NEW_MONTH}.payments +990000`);
  console.log(`  monthlyRevenue: ${tx.branchId}_${OLD_MONTH}.amount -990000, ${tx.branchId}_${NEW_MONTH}.amount +990000`);

  if (!APPLY) {
    console.log('\nЭто был dry-run. Для реальной записи запусти с флагом --apply');
    return;
  }

  const batch = writeBatch(db);

  batch.update(doc(db, 'transactions', target.id), {
    date: Timestamp.fromDate(NEW_DATE),
    month: NEW_MONTH,
  });

  batch.set(
    doc(db, 'monthlyBalances', `${student.id}_${OLD_MONTH}`),
    { payments: increment(-990000), balance: increment(-990000), updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(
    doc(db, 'monthlyBalances', `${student.id}_${NEW_MONTH}`),
    { studentId: student.id, month: NEW_MONTH, payments: increment(990000), balance: increment(990000), updatedAt: serverTimestamp() },
    { merge: true },
  );

  batch.set(
    doc(db, 'monthlyRevenue', `${tx.branchId}_${OLD_MONTH}`),
    { amount: increment(-990000), paymentsCount: increment(-1), updatedAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(
    doc(db, 'monthlyRevenue', `${tx.branchId}_${NEW_MONTH}`),
    { branchId: tx.branchId, month: NEW_MONTH, amount: increment(990000), paymentsCount: increment(1), updatedAt: serverTimestamp() },
    { merge: true },
  );

  await batch.commit();
  console.log('Записано.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
