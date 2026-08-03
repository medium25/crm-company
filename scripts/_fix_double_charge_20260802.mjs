/**
 * 13 студентов (12 новых из _migrate_delta_20260801.mjs + Shahlo Sayfuddinova
 * из _archive_deleted_20260802.mjs) получили двойное списание за август:
 * их стартовый balance уже включал списание, которое старая система сделала
 * сама (видно в её "Payments"/"Monthly balance status" на момент выгрузки),
 * а потом наш runMonthlyBilling (02.08.2026) списал им ещё раз.
 * Реверс — коррекция +price на баланс каждого (без сторно транзакции
 * списания — она осталась в истории как есть, добавляем компенсирующую
 * запись, как и `Ergash -840000 correction` в исходных данных).
 *
 *   node --env-file=.env scripts/_fix_double_charge_20260802.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const AFFECTED = [
  { name: 'Malika Fattoyeva', price: 910000 },
  { name: 'Sharifabonu Ahrorjonova', price: 840000 },
  { name: 'Sarvinoz Muhammadkulova', price: 840000 },
  { name: 'Axmadxon Shuxratov', price: 840000 },
  { name: 'Muhammadiev Bekzod', price: 840000 },
  { name: 'Shuxrat Ashurov', price: 840000 },
  { name: 'Ziyayeva Madina', price: 840000 },
  { name: 'Sultonova Komila', price: 840000 },
  { name: 'Mubina Muminova', price: 890000 },
  { name: "Bilol Jo'rayev", price: 840000 },
  { name: 'Zuhriddin Qayimov', price: 840000 },
  { name: 'Nodira Jumanazarova', price: 840000 },
  { name: 'Shahlo Sayfuddinova', price: 840000 },
];

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const studentsSnap = await getDocs(collection(db, 'students'));
  const byName = new Map();
  studentsSnap.forEach((d) => byName.set(d.data().fullName, { id: d.id, ...d.data() }));

  const batch = writeBatch(db);
  let totalReversed = 0;
  for (const { name, price } of AFFECTED) {
    const s = byName.get(name);
    if (!s) throw new Error(`Не найден: ${name}`);
    const txRef = doc(collection(db, 'transactions'));
    batch.set(txRef, {
      id: txRef.id,
      branchId: 'icon-main',
      studentId: s.id,
      studentName: name,
      enrollmentId: null,
      groupId: null,
      groupCode: null,
      teacherId: null,
      teacherName: null,
      type: 'correction',
      amount: price,
      method: null,
      date: serverTimestamp(),
      month: '2026-08',
      comment: 'Реверс двойного списания за август (баланс при переносе уже включал списание из modme)',
      periodFrom: null,
      periodTo: null,
      lessonsCount: null,
      createdBy: uid,
      createdByName: 'Система (миграция)',
      createdAt: serverTimestamp(),
      isReversed: false,
      reversedBy: null,
    });
    batch.update(doc(db, 'students', s.id), {
      balance: increment(price),
      balanceUpdatedAt: serverTimestamp(),
    });
    totalReversed += price;
    console.log('REVERSED:', name, '+', price.toLocaleString('ru-RU'));
  }
  await batch.commit();
  console.log(`Готово. Реверснуто: ${totalReversed.toLocaleString('ru-RU')} UZS на ${AFFECTED.length} студентов`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
