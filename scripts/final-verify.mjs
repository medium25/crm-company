import { readFileSync } from 'fs';
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

const ledgers = JSON.parse(readFileSync('/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/be1ba6fd-58d1-4187-8d55-6ab9cb97ff58/scratchpad/old_ledgers.json', 'utf8'));

let ok = 0, mismatch = 0;
for (const [phone, rec] of Object.entries(ledgers)) {
  const snap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  if (snap.empty) { console.log(`${rec.name}: не найден`); continue; }
  const newBalance = snap.docs[0].data().balance;
  const diff = Math.round((newBalance - rec.balance) * 100) / 100;
  if (Math.abs(diff) < 1) { ok++; continue; }
  mismatch++;
  console.log(`${rec.name.padEnd(28)} new=${newBalance}  old=${rec.balance}  diff=${diff}`);
}
console.log(`\nOK: ${ok}  MISMATCH: ${mismatch}`);
process.exit(0);
