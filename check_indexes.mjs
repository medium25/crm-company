import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, orderBy } from 'firebase/firestore';

const app = initializeApp({
  apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN, projectId: process.env.VITE_FB_PROJECT_ID,
});
const auth = getAuth(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const db = getFirestore(app);
const tests = [
  ['rooms branchId+orderBy(name)', query(collection(db,'rooms'), where('branchId','==','icon-main'), orderBy('name'))],
  ['teachers full query', query(collection(db,'teachers'), where('branchIds','array-contains','icon-main'), where('isArchived','==',false), orderBy('displayName'))],
  ['students leads query', query(collection(db,'students'), where('branchId','==','icon-main'), where('isArchived','==',false), where('status','in',['lead','trial']), orderBy('createdAt','desc'))],
  ['enrollments groupId+status', query(collection(db,'enrollments'), where('groupId','==','7XvdvdVguvhoNsb1oX2q'), where('status','!=','archived'))],
];
let allOk = true;
for (const [name, q] of tests) {
  try { const s = await getDocs(q); console.log('OK  ', name, s.size); }
  catch (err) { console.log('FAIL', name, '->', err.code); allOk = false; }
}
process.exit(allOk ? 0 : 1);
