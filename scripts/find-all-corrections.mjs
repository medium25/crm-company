import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

const snap = await getDocs(query(collection(db, 'transactions'), where('type', '==', 'correction')));
const byPrefix = new Map();
const all = [];
snap.forEach((d) => {
  const t = d.data();
  const prefix = (t.comment || '').slice(0, 40);
  byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
  all.push({ id: d.id, studentName: t.studentName, studentId: t.studentId, amount: t.amount, comment: t.comment, createdByName: t.createdByName });
});
console.log('Всего correction:', all.length);
console.log('\nПо префиксу комментария:');
for (const [p, c] of byPrefix) console.log(`  ${c}x  "${p}"`);
console.log('\nНе моих (createdByName != Doniyor Shavkatov):');
all.filter(a => a.createdByName !== 'Doniyor Shavkatov').forEach(a => console.log(`  ${a.studentName.padEnd(28)} ${a.amount}  by=${a.createdByName}  "${a.comment}"`));
process.exit(0);
