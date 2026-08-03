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

const ids = ['4WHwlISsk8LCMZms5oaT','UP5dunYQQEl9kNYhvgv7','qFQeZPsmT12IjIWSfmU7','ocUCmWSqAKLqbCrrl66S','5yUEP19oWkIHZUqJUVdr','F3WnQrcUM6aMmh1plxnk','cOFAkrFCnmiEfUeO3QfQ'];
for (const id of ids) {
  const s = await getDoc(doc(db, 'students', id));
  const d = s.data();
  console.log(id, '|', d.fullName, '| isArchived=', d.isArchived, '| phone=', d.phone, '| createdAt=', d.createdAt?.toDate?.().toISOString(), '| groupId=', d.groupIds || d.groupId);
}
process.exit(0);
