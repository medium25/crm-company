import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

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

const id = process.argv[2];
const sDoc = await getDoc(doc(db, 'students', id));
console.log('student:', JSON.stringify(sDoc.data(), null, 1));

const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', id)));
console.log(`\ntransactions: ${txSnap.size}`);
txSnap.forEach((d) => {
  const t = d.data();
  console.log(`  [${d.id}] type=${t.type} amount=${t.amount} month=${t.month} date=${t.date?.toDate?.()?.toISOString().slice(0,10)} group=${t.groupCode} createdByName=${t.createdByName}`);
});
process.exit(0);
