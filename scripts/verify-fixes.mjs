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

const checks = [
  ['998955800777', -720000, 'Mohinur Mansurova'],
  ['998931427252', -890000, 'Fazliddin Lutfullayev'],
  ['998951112121', -866000, 'Ilhom Mirakbarov'],
  ['998977949009', -840000, 'Yunus Hamdamov'],
  ['998948687333', -625000, "Muqaddas Jo'rayeva"],
  ['998909620009', -1680000, 'Bahodir Aripov'],
  ['998998947557', -890000, 'Muslima Jamalova'],
];

for (const [phone, expected, name] of checks) {
  const snap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  const b = snap.docs[0]?.data().balance;
  console.log(`${name.padEnd(22)} balance=${b}  expected=${expected}  ${b === expected ? 'OK' : 'MISMATCH!!!'}`);
}
process.exit(0);
