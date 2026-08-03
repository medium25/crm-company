import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';

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

const from = Timestamp.fromDate(new Date('2026-07-01T00:00:00'));
const to = Timestamp.fromDate(new Date('2026-07-31T23:59:59'));

const snap = await getDocs(
  query(
    collection(db, 'transactions'),
    where('branchId', '==', 'icon-main'),
  ),
);

let count = 0;
let paymentSum = 0;
let paymentCount = 0;
snap.forEach((d) => {
  const t = d.data();
  if (t.date.toMillis() < from.toMillis() || t.date.toMillis() > to.toMillis()) return;
  count++;
  if (t.type === 'payment') {
    paymentSum += t.amount;
    paymentCount++;
  }
});

console.log('Всего документов (branchId=icon-main, июль):', count);
console.log('Из них type=payment:', paymentCount, 'сумма:', paymentSum.toLocaleString('ru-RU'));

const allSnap = await getDocs(collection(db, 'transactions'));
console.log('Всего документов в transactions (вся коллекция):', allSnap.size);
const branchCounts = {};
allSnap.forEach((d) => {
  const b = d.data().branchId;
  branchCounts[b] = (branchCounts[b] || 0) + 1;
});
console.log('По branchId:', branchCounts);

process.exit(0);
