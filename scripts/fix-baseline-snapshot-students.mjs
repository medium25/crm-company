import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const APPLY = process.argv.includes('--apply');
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const ledgers = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/be1ba6fd-58d1-4187-8d55-6ab9cb97ff58/scratchpad/old_ledgers.json', 'utf8'));
const byName = new Map(Object.values(ledgers).map((r) => [r.name, r]));

const AFFECTED = [
  "Zuhriddin Qayimov", "Nodira Jumanazarova", "Axmadxon Shuxratov", "Malika Fattoyeva",
  "Sultonova Komila", "Muhammadiev Bekzod", "Shahlo Sayfuddinova", "Bilol Jo'rayev",
  "Mubina Muminova", "Sitora Egamberdiyeva", "Aydin Adilova", "Muhammad Xamidov",
];

let totalDeleted = 0;
for (const name of AFFECTED) {
  const rec = byName.get(name);
  if (!rec) { console.log(`${name}: нет в old_ledgers (пропуск)`); continue; }

  const sSnap = await getDocs(query(collection(db, 'students'), where('fullName', '==', name)));
  const sDoc = sSnap.docs.find((d) => d.id) ?? sSnap.docs[0];
  if (!sDoc) { console.log(`${name}: студент не найден в новой системе`); continue; }
  const student = { id: sDoc.id, ...sDoc.data() };

  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', student.id)));
  const mine = [];
  txSnap.forEach((d) => {
    const t = d.data();
    if ((t.comment || '').includes('перенос из старой системы')) mine.push({ id: d.id, ...t });
  });

  console.log(`${name}: удалить ${mine.length} моих записей, баланс ${student.balance} -> ${rec.balance}`);
  if (APPLY) {
    for (const m of mine) {
      await deleteDoc(doc(db, 'transactions', m.id));
      totalDeleted++;
    }
    await updateDoc(doc(db, 'students', student.id), { balance: rec.balance, balanceUpdatedAt: serverTimestamp() });
  }
}
console.log(`\n${APPLY ? 'Удалено' : 'Будет удалено'}: ${totalDeleted}`);
if (!APPLY) console.log('dry-run. Запусти с --apply для реальной записи.');
process.exit(0);
