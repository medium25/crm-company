import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const APPLY = process.argv.includes('--apply');
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const fixes = [
  ['505764814', '998505764814'], // Marjona Ungboyeva
  ['878112612', '998878112612'], // Ismoil Turgunov
];

for (const [bad, good] of fixes) {
  const snap = await getDocs(query(collection(db, 'students'), where('phone', '==', bad)));
  if (snap.empty) { console.log(bad, 'не найден'); continue; }
  const s = snap.docs[0];
  console.log(`${APPLY ? 'ПРАВКА' : 'dry-run'}: ${s.data().fullName} phone ${bad} -> ${good}`);
  if (APPLY) await updateDoc(doc(db, 'students', s.id), { phone: good, updatedAt: serverTimestamp(), updatedBy: user.uid });
}
process.exit(0);
