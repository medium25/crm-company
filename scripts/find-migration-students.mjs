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
const affected = [];
snap.forEach((d) => {
  const t = d.data();
  if ((t.comment || '').includes('Реверс двойного списания')) {
    affected.push({ studentId: t.studentId, studentName: t.studentName });
  }
});
console.log(`Найдено студентов с migration-reversal: ${affected.length}`);
affected.forEach((a) => console.log(`  ${a.studentName} (${a.studentId})`));
process.exit(0);
