// Лиды, пришедшие из синка Google Sheets (у них заполнен russianLevel —
// поле из анкеты, которое руками никто не вводит), но с source, отличным
// от meta_target — старые записи до того, как SheetsSync.gs стал писать
// source. Проставляет meta_target.
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

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

const snap = await getDocs(collection(db, 'students'));
const toFix = snap.docs.filter((d) => {
  const data = d.data();
  return data.russianLevel && data.source !== 'meta_target';
});

console.log(`Найдено ${toFix.length} из ${snap.size}`);
for (const d of toFix) {
  const data = d.data();
  console.log(`${APPLY ? 'ПРАВКА' : 'dry-run'}: ${data.fullName} source ${JSON.stringify(data.source)} -> meta_target`);
  if (APPLY) await updateDoc(doc(db, 'students', d.id), { source: 'meta_target', updatedAt: serverTimestamp(), updatedBy: user.uid });
}
process.exit(0);
