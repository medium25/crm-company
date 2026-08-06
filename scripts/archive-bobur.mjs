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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const snap = await getDocs(query(collection(db, 'students'), where('phone', '==', '998937686006')));
if (snap.empty) { console.log('не найден'); process.exit(0); }
const s = { id: snap.docs[0].id, ...snap.docs[0].data() };
console.log(`Архивирую: ${s.fullName} (${s.id}), isArchived было ${s.isArchived}`);
await updateDoc(doc(db, 'students', s.id), { isArchived: true, updatedAt: serverTimestamp(), updatedBy: user.uid });

const eSnap = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', s.id)));
for (const d of eSnap.docs) {
  await updateDoc(doc(db, 'enrollments', d.id), { isArchived: true, status: 'archived', updatedAt: serverTimestamp(), updatedBy: user.uid });
  console.log(`  enrollment ${d.id} тоже архивирован`);
}
console.log('Готово.');
process.exit(0);
