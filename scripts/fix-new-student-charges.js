/**
 * Правка августовских списаний для 4 студентов, заведённых скриптом
 * sync-old-payments.js (Lobar, Sherzod, Nasiba Usarova, Bexruz Ganiyev).
 *
 * chargePartialMonth() в новой системе делит цену на group.lessonsPerMonth
 * (константа, обычно 12), а старая система (modme) делит на РЕАЛЬНОЕ число
 * уроков в конкретном месяце (в августе 2026 у групп с 3 занятиями/неделю
 * это 13, не 12) — отсюда расхождение в частичном списании при зачислении
 * в середине месяца. Правим только эти 4 транзакции под точные суммы из
 * старой системы (взято из профилей студентов в icon.modme.uz).
 *
 *   node --env-file=.env scripts/fix-new-student-charges.js
 *   node --env-file=.env scripts/fix-new-student-charges.js --apply
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
const MONTH = '2026-08';

// [телефон, правильная сумма списания (как в старой системе)]
const FIXES = [
  ['998501046557', -710769], // Lobar
  ['998883930705', -710769], // Sherzod
  ['998939980203', -420000], // Nasiba Usarova
  ['998777160742', -840000], // Bexruz Ganiyev
];

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  const batch = writeBatch(db);
  let n = 0;

  for (const [phone, correctAmount] of FIXES) {
    const sSnap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
    if (sSnap.empty) { console.log(`${phone}: студент не найден`); continue; }
    const student = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() };

    const txSnap = await getDocs(
      query(collection(db, 'transactions'), where('studentId', '==', student.id), where('type', '==', 'charge'), where('month', '==', MONTH)),
    );
    if (txSnap.empty) { console.log(`${student.fullName}: списание за ${MONTH} не найдено`); continue; }
    const txDoc = txSnap.docs[0];
    const tx = txDoc.data();
    const delta = correctAmount - tx.amount;

    console.log(
      `${APPLY ? 'ПРАВКА' : 'dry-run'}: ${student.fullName.padEnd(20)} списание ${tx.amount} -> ${correctAmount} (delta ${delta > 0 ? '+' : ''}${delta}), баланс ${student.balance} -> ${student.balance + delta}`,
    );

    if (APPLY) {
      batch.update(doc(db, 'transactions', txDoc.id), { amount: correctAmount });
      batch.update(doc(db, 'students', student.id), { balance: increment(delta), balanceUpdatedAt: serverTimestamp() });
      batch.set(
        doc(db, 'monthlyBalances', `${student.id}_${MONTH}`),
        { charges: increment(delta), balance: increment(delta), updatedAt: serverTimestamp() },
        { merge: true },
      );
      n++;
    }
  }

  if (APPLY) {
    await batch.commit();
    console.log(`\nЗаписано: ${n}.`);
  } else {
    console.log('\nЭто был dry-run. Для реальной записи запусти с флагом --apply');
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
