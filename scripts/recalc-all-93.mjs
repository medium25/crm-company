import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { recalcBalance } from '../src/lib/billing.js';

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

let fixed = 0, unchanged = 0;
for (const [phone, rec] of Object.entries(ledgers)) {
  const snap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  if (snap.empty) continue;
  const s = snap.docs[0];
  const before = s.data().balance;
  const after = await recalcBalance(db, s.id);
  if (Math.round(before) !== Math.round(after)) {
    console.log(`${rec.name.padEnd(28)} ${before} -> ${after}`);
    fixed++;
  } else {
    unchanged++;
  }
}
console.log(`\nПересчитано (изменилось): ${fixed}. Без изменений: ${unchanged}.`);
process.exit(0);
