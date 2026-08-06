import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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

const ids = ['9FEgApHQkyHcxwr11rW8','n3KbpzzPemWi4WyF7NyO','XQj3BlJyI2085Dbab4jT','4CjlghW7hq8VjcdfgweF','kZm1FYmo8Si2krtQ6VJ1','W4eLatHEJEDERAe4Yeo5'];
for (const id of ids) {
  const d = await getDoc(doc(db, 'transactions', id));
  console.log(id, JSON.stringify(d.data()));
}
process.exit(0);
