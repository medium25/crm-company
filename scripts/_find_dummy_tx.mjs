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

const KNOWN_CREATORS = new Set(["Muqaddas Jo'rayeva", 'Doniyor Shavkatov', 'Mr Abduganiev', 'Ruxshona']);

const snap = await getDocs(query(collection(db, 'transactions'), where('branchId', '==', 'icon-main')));
const suspicious = [];
snap.forEach((d) => {
  const t = d.data();
  if (!KNOWN_CREATORS.has(t.createdByName)) {
    suspicious.push({ id: d.id, ...t, dateStr: t.date?.toDate?.().toISOString() });
  }
});
console.log('Подозрительные (не из нашего импорта) транзакции:', suspicious.length);
for (const s of suspicious) {
  console.log(s.id, s.dateStr, s.studentName, s.amount, s.type, 'createdByName=' + s.createdByName);
}
process.exit(0);
