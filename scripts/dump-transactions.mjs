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

const phones = process.argv.slice(2);
for (const phone of phones) {
  const sSnap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  if (sSnap.empty) { console.log(phone, 'НЕ НАЙДЕН'); continue; }
  const s = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() };
  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', s.id)));
  const txs = [];
  txSnap.forEach((d) => txs.push({ id: d.id, ...d.data() }));
  txs.sort((a, b) => (a.date?.toDate?.() ?? 0) - (b.date?.toDate?.() ?? 0));
  console.log(`\n${s.fullName} (${s.id})  balance=${s.balance}`);
  txs.forEach((t) => {
    console.log(`  [${t.id}] type=${t.type} amount=${t.amount} month=${t.month} date=${t.date?.toDate?.()?.toISOString().slice(0,10)} groupCode=${t.groupCode} method=${t.method ?? ''}`);
  });
}
process.exit(0);
