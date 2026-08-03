/**
 * 7 студентов из исходных 146 (Phase 1, снимок 25.07.2026) имели неточный
 * стартовый balance — расхождение не объясняется платежами (сверено с их
 * историей транзакций), значит ошибка была в самих цифрах Phase 1.
 * Корректируем до точного текущего значения из modme.
 *
 *   node --env-file=.env scripts/_fix_debtor_amounts_20260802.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

// diff = сумма коррекции на balance (может быть отрицательной)
const FIXES = [
  { name: 'Erkinova Muhlisa', diff: -50000 },
  { name: 'Kamronbek Yunusov', diff: -460000 },
  { name: 'Ilhom Mirakbarov', diff: -460000 },
  { name: 'Muhammad Xamidov', diff: -90000 },
  { name: 'Sitora Egamberdiyeva', diff: -460000 },
  { name: 'Maftuna Mohirjonova', diff: 83385 },
  { name: 'Aydin Adilova', diff: -60000 },
];

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const studentsSnap = await getDocs(collection(db, 'students'));
  const byName = new Map();
  studentsSnap.forEach((d) => byName.set(d.data().fullName, { id: d.id, ...d.data() }));

  const batch = writeBatch(db);
  for (const { name, diff } of FIXES) {
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
      amount: diff,
      method: null,
      date: serverTimestamp(),
      month: '2026-08',
      comment: 'Коррекция стартового баланса Phase 1 — сверка с текущим значением в modme (02.08.2026)',
      periodFrom: null,
      periodTo: null,
      lessonsCount: null,
      createdBy: uid,
      createdByName: 'Система (сверка)',
      createdAt: serverTimestamp(),
      isReversed: false,
      reversedBy: null,
    });
    batch.update(doc(db, 'students', s.id), { balance: increment(diff), balanceUpdatedAt: serverTimestamp() });
    console.log('FIXED:', name, diff > 0 ? '+' : '', diff);
  }
  await batch.commit();
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
