import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { deleteTransaction } from '../src/lib/billing.js';
const firebaseConfig = { apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN, projectId: process.env.VITE_FB_PROJECT_ID, storageBucket: process.env.VITE_FB_STORAGE_BUCKET, messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID, appId: process.env.VITE_FB_APP_ID };
const app = initializeApp(firebaseConfig);
await signInWithEmailAndPassword(getAuth(app), process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const db = getFirestore(app);
for (const id of ['vDePt7OC8q2U3DpGs0LZ', 'oipcUuZdbVM1QiKoVL7f']) {
  const snap = await getDoc(doc(db, 'transactions', id));
  await deleteTransaction(db, { id, ...snap.data() });
  console.log('Удалено:', id);
}
const check = await getDoc(doc(db, 'students', 'FXx2J01Hi9IJxo1a2qWz'));
console.log('Итоговый баланс:', check.data().balance);
process.exit(0);
