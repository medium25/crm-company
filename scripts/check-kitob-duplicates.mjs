import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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

const snap = await getDocs(query(collection(db, 'students'), where('fullName', '==', 'Kitob')));
for (const d of snap.docs) {
  const s = d.data();
  console.log(JSON.stringify({ id: d.id, publicId: s.publicId, phone: s.phone, balance: s.balance, status: s.status, isArchived: s.isArchived, createdAt: s.createdAt?.toDate?.() }, null, 2));

  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', d.id)));
  console.log(`  транзакций: ${txSnap.size}`);
  txSnap.docs.forEach((t) => console.log(`    ${t.id} ${t.data().type} ${t.data().amount} ${t.data().date?.toDate?.()}`));
}
process.exit(0);
