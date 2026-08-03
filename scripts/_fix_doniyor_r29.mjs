import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, collection, getDocs, query, where, writeBatch, serverTimestamp, increment } from 'firebase/firestore';

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
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const batch = writeBatch(db);
batch.update(doc(db, 'enrollments', 'Ho3Gd5XiJkteL981h2za'), {
  status: 'archived', isArchived: true, updatedBy: user.uid, updatedAt: serverTimestamp(),
});
const g = await getDocs(query(collection(db, 'groups'), where('code', '==', 'R29')));
g.forEach((d) => batch.update(doc(db, 'groups', d.id), { studentsCount: increment(-1) }));
await batch.commit();
console.log('done');
process.exit(0);
