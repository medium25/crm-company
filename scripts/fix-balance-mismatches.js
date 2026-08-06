/**
 * Правка расхождений баланса, найденных при сверке 60 студентов "вне
 * списка без истории списаний" против старой системы (icon.modme.uz).
 *
 * Три разных корня проблемы:
 *  A) Одно конкретное списание в новой системе с неверной суммой (Mohinur,
 *     Fazliddin) — правим сумму этой транзакции напрямую.
 *  B) Денормализованный students.balance разошёлся с суммой транзакций,
 *     хотя сама сумма транзакций УЖЕ совпадает со старой системой (Ilhom) —
 *     просто пересчитываем баланс из транзакций (recalcBalance).
 *  C) Реальная историческая нехватка/лишек в цепочке начислений за много
 *     месяцев, где точечно найти виновную транзакцию не имеет смысла
 *     (Yunus, Muqaddas, Bahodir, Muslima) — добавляем одну транзакцию
 *     type=correction на разницу, тем же паттерном, что уже используется
 *     в существующих данных (см. Yunus Hamdamov: rev_* транзакция).
 *
 *   node --env-file=.env scripts/fix-balance-mismatches.js
 *   node --env-file=.env scripts/fix-balance-mismatches.js --apply
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
  updateDoc,
  setDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { writeTransaction, recalcBalance } from '../src/lib/billing.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const APPLY = process.argv.includes('--apply');
const BRANCH_ID = 'icon-main';

// A) точечная правка суммы одной транзакции
const CHARGE_FIXES = [
  { phone: '998955800777', txId: 'LZnozlo2jzbkW23J3LlO', month: '2026-07', from: -770000, to: -720000 }, // Mohinur Mansurova
  { phone: '998931427252', txId: 'fm5yFnVHn5VLUnsWtiep', month: '2026-07', from: -840000, to: -890000 }, // Fazliddin Lutfullayev
];

// B) просто пересчитать денормализованный баланс из транзакций
const RECALC_FIXES = [
  { phone: '998951112121', expected: -866000 }, // Ilhom Mirakbarov
];

// C) добавить корректирующую транзакцию на разницу до баланса старой системы
const CORRECTION_FIXES = [
  { phone: '998977949009', targetBalance: -840000, name: 'Yunus Hamdamov' },
  { phone: '998948687333', targetBalance: -625000, name: "Muqaddas Jo'rayeva" },
  { phone: '998909620009', targetBalance: -1680000, name: 'Bahodir Aripov' },
  { phone: '998998947557', targetBalance: -890000, name: 'Muslima Jamalova' },
];

async function findStudent(db, phone) {
  const snap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const staffUser = { uid: user.uid, fullName: 'Doniyor Shavkatov' };

  console.log('--- A) точечные правки суммы списания ---');
  for (const fix of CHARGE_FIXES) {
    const student = await findStudent(db, fix.phone);
    if (!student) { console.log(`${fix.phone}: студент не найден`); continue; }
    const delta = fix.to - fix.from;
    console.log(
      `${APPLY ? 'ПРАВКА' : 'dry-run'}: ${student.fullName.padEnd(22)} списание ${fix.month} ${fix.from} -> ${fix.to}, баланс ${student.balance} -> ${student.balance + delta}`,
    );
    if (APPLY) {
      await updateDoc(doc(db, 'transactions', fix.txId), { amount: fix.to });
      await updateDoc(doc(db, 'students', student.id), { balance: increment(delta), balanceUpdatedAt: serverTimestamp() });
      await setDoc(
        doc(db, 'monthlyBalances', `${student.id}_${fix.month}`),
        { charges: increment(delta), balance: increment(delta), updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
  }

  console.log('\n--- B) пересчёт денормализованного баланса ---');
  for (const fix of RECALC_FIXES) {
    const student = await findStudent(db, fix.phone);
    if (!student) { console.log(`${fix.phone}: студент не найден`); continue; }
    console.log(`${APPLY ? 'ПЕРЕСЧЁТ' : 'dry-run'}: ${student.fullName.padEnd(22)} баланс ${student.balance} -> (сумма транзакций, ожидается ${fix.expected})`);
    if (APPLY) {
      const result = await recalcBalance(db, student.id);
      console.log(`  -> пересчитано: ${result}`);
    }
  }

  console.log('\n--- C) корректирующие транзакции ---');
  for (const fix of CORRECTION_FIXES) {
    const student = await findStudent(db, fix.phone);
    if (!student) { console.log(`${fix.phone}: студент не найден`); continue; }
    const delta = fix.targetBalance - student.balance;
    if (delta === 0) { console.log(`${student.fullName}: баланс уже верный`); continue; }
    console.log(
      `${APPLY ? 'КОРРЕКЦИЯ' : 'dry-run'}: ${student.fullName.padEnd(22)} баланс ${student.balance} -> ${fix.targetBalance} (correction ${delta > 0 ? '+' : ''}${delta})`,
    );
    if (APPLY) {
      await writeTransaction(db, {
        branchId: BRANCH_ID,
        studentId: student.id,
        studentName: student.fullName,
        enrollmentId: null,
        groupId: null,
        groupCode: null,
        teacherId: null,
        teacherName: null,
        type: 'correction',
        amount: delta,
        method: null,
        date: new Date(),
        month: '2026-08',
        comment: 'Сверка баланса со старой системой (icon.modme.uz)',
        periodFrom: null,
        periodTo: null,
        lessonsCount: null,
        createdBy: staffUser.uid,
        createdByName: staffUser.fullName,
      });
    }
  }

  console.log(APPLY ? '\nГотово.' : '\nЭто был dry-run. Для реальной записи запусти с флагом --apply');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
