import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

// Явный список — только подтверждённые тестовые транзакции (студент archived,
// фейковый телефон, создан сегодня). VDAVQs23CJHnMhhgtpf1 (Javohir Turdiyev,
// реальный активный студент) сюда НЕ входит — его не трогаем.
const DUMMY_TX_IDS = [
  'AtCiA1YEs4rhwdbLGTRV',
  'KHhCjt0e4RWmgVSMkYUS',
  'PYArXYJ6S0CTPjFAIho7',
  'Yj4lV4c0FJRAguFi3jsR',
  'charge_6qI1VeXTSuSaG5VLrqhW_2026-07',
  'charge_VQiIufOo88tS8vDYH7fs_2026-07',
  'charge_d54KqWghPMRoC7QfB03I_2026-07',
  'charge_zB4rlW7YVLiRlxv2EbCY_2026-07',
  'yh3HU1mynXSfkbgTA2WZ',
];

// плюс orphan-коррекции (сторно), созданные при старом тесте удаления через
// reverseTransaction, если они ссылаются на что-то из списка выше.
const snap = await getDocs(query(collection(db, 'transactions'), where('branchId', '==', 'icon-main'), where('type', '==', 'correction')));
const orphanCorrections = [];
snap.forEach((d) => {
  if (DUMMY_TX_IDS.some((id) => d.id === `rev_${id}`)) orphanCorrections.push(d.id);
});

const toDelete = [...DUMMY_TX_IDS, ...orphanCorrections];
console.log('К удалению:', toDelete.length, 'транзакций');
for (const id of toDelete) console.log(' -', id);

let batch = writeBatch(db);
for (const id of toDelete) batch.delete(doc(db, 'transactions', id));
await batch.commit();

console.log('\nУдалено:', toDelete.length);
process.exit(0);
