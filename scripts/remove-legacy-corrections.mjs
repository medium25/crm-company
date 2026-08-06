import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';
import { recalcBalance } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
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

const phones = [
  '998770055558', // Axmadxon Shuxratov
  '998900684477', // Bilol Jo'rayev
  '998888778809', // Mubina Muminova
  '998900037428', // Muhammad Xamidov
  '998990808664', // Muhammadiev Bekzod
  '998779607377', // Nodira Jumanazarova
  '998998027828', // Shahlo Sayfuddinova
  '998937093971', // Sitora Egamberdiyeva
  '998991186979', // Sultonova Komila
  '998909435582', // Aydin Adilova (diff was -60000, check separately)
];

for (const phone of phones) {
  const sSnap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  if (sSnap.empty) { console.log(`${phone}: не найден`); continue; }
  const s = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() };
  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', s.id), where('type', '==', 'correction')));
  const legacy = [];
  txSnap.forEach((d) => {
    const t = d.data();
    if ((t.comment || '').includes('Реверс двойного списания') || (t.comment || '').includes('Коррекция стартового баланса')) {
      legacy.push({ id: d.id, ...t });
    }
  });
  if (!legacy.length) { console.log(`${s.fullName}: legacy-корректировок нет`); continue; }
  console.log(`${s.fullName}: удалить ${legacy.length} legacy-correction (${legacy.map(l => l.amount).join(', ')})`);
  if (APPLY) {
    for (const l of legacy) await deleteDoc(doc(db, 'transactions', l.id));
    const bal = await recalcBalance(db, s.id);
    console.log(`  -> пересчитан баланс: ${bal}`);
  }
}
console.log(APPLY ? '\nГотово.' : '\ndry-run. Запусти с --apply.');
process.exit(0);
