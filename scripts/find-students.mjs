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

const snap = await getDocs(query(collection(db, 'students'), where('branchId', '==', 'icon-main'), where('isArchived', '==', false), where('status', '==', 'active')));
const list = [];
snap.forEach((d) => list.push({ id: d.id, fullName: d.data().fullName, phone: d.data().phone }));
console.log('count:', list.length);
import { writeFileSync } from 'fs';
writeFileSync('/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/be1ba6fd-58d1-4187-8d55-6ab9cb97ff58/scratchpad/new_active.json', JSON.stringify(list, null, 2));
process.exit(0);
