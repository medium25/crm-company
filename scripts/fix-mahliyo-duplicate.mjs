/**
 * Баг моего же бэкафилла: Mahliyo Xasanova уже существовала в базе
 * (status=lead, id=JlmOaEpFGnCbWiNoNjEc, phone="940288807" без кода
 * страны) — add-missing-active-student.mjs искал точное совпадение
 * "998940288807" и не нашёл её, создал дубль (id=0dbvPIr465uW5BKMKsjf,
 * status=active).
 *
 * firestore.rules: students.delete всегда false (нельзя удалить вообще),
 * transactions.update разрешает менять только
 * [amount,comment,date,month,updatedAt,updatedBy] — studentId нельзя
 * перезаписать на месте. Поэтому: enrollment просто перепривязываю
 * (enrollments.write без ограничения полей), транзакцию дубля удаляю
 * (deleteTransaction — с откатом баланса) и создаю заново под оригиналом
 * (recordPayment), дубль-карточку не удаляю (нельзя), а архивирую.
 *
 *   node --env-file=.env scripts/fix-mahliyo-duplicate.mjs           # dry-run
 *   node --env-file=.env scripts/fix-mahliyo-duplicate.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deleteTransaction, recordPayment, recordManualCharge } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const BRANCH_ID = 'icon-main';
const DUPLICATE_ID = '0dbvPIr465uW5BKMKsjf';
const ORIGINAL_ID = 'JlmOaEpFGnCbWiNoNjEc';
const TARGET_BALANCE = 129231; // округлено, старая система: 129230.77

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
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', DUPLICATE_ID)));
  const enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', DUPLICATE_ID)));
  const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  console.log(`enrollments дубля: ${enrollments.map((e) => e.id).join(', ')}`);
  console.log(`transactions дубля: ${transactions.map((t) => `${t.id}(${t.amount})`).join(', ')}`);
  console.log(`Перепривязать enrollment на ${ORIGINAL_ID}, удалить+пересоздать транзакции, status=active, activeGroupsCount=1`);
  console.log(`Дубль ${DUPLICATE_ID}: архивировать (удалить нельзя — firestore.rules)`);
  console.log(`Корректирующая транзакция на оригинале: довести баланс до ${TARGET_BALANCE}`);

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  for (const e of enrollments) {
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(db, 'enrollments', e.id), { studentId: ORIGINAL_ID, studentName: 'Mahliyo Xasanova', updatedAt: serverTimestamp(), updatedBy: user.uid });
  }

  for (const t of transactions) {
    // eslint-disable-next-line no-await-in-loop
    await deleteTransaction(db, t);
  }

  const originalSnapBefore = await getDoc(doc(db, 'students', ORIGINAL_ID));
  const originalStudent = { id: ORIGINAL_ID, ...originalSnapBefore.data() };

  for (const t of transactions.filter((x) => x.type === 'payment')) {
    // eslint-disable-next-line no-await-in-loop
    await recordPayment(
      db,
      {
        student: originalStudent,
        branchId: BRANCH_ID,
        amount: t.amount,
        method: t.method,
        date: t.date.toDate(),
        comment: t.comment ?? '',
        groupId: t.groupId,
        groupCode: t.groupCode,
      },
      staffUser,
    );
  }

  await updateDoc(doc(db, 'students', ORIGINAL_ID), {
    status: 'active',
    activeGroupsCount: 1,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });

  await updateDoc(doc(db, 'students', DUPLICATE_ID), {
    isArchived: true,
    status: 'left',
    activeGroupsCount: 0,
    balance: 0,
    note: `Дубль карточки ${ORIGINAL_ID} (Mahliyo Xasanova) — данные перенесены, merge ${new Date().toISOString().slice(0, 10)}.`,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });

  const originalSnapAfter = await getDoc(doc(db, 'students', ORIGINAL_ID));
  const currentBalance = originalSnapAfter.data().balance ?? 0;
  const correction = TARGET_BALANCE - currentBalance;
  if (correction !== 0) {
    await recordManualCharge(
      db,
      { student: { id: ORIGINAL_ID, fullName: 'Mahliyo Xasanova' }, branchId: BRANCH_ID, amount: correction, comment: 'Сверка баланса со старой системой (icon.modme.uz)', date: new Date() },
      staffUser,
    );
  }
  console.log(`Готово. Баланс до коррекции ${currentBalance}, коррекция ${correction}, итог ${TARGET_BALANCE}.`);
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
