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

const BRANCH_ID = 'icon-main';
const CURRENT_MONTH = '2026-08';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const studentsSnap = await getDocs(query(collection(db, 'students'), where('branchId', '==', BRANCH_ID), where('isArchived', '==', false)));
const students = [];
studentsSnap.forEach((d) => students.push({ id: d.id, ...d.data() }));

const chargesSnap = await getDocs(query(collection(db, 'transactions'), where('branchId', '==', BRANCH_ID), where('type', '==', 'charge')));
const chargesByStudent = new Map();
chargesSnap.forEach((d) => {
  const c = d.data();
  if (!chargesByStudent.has(c.studentId)) chargesByStudent.set(c.studentId, []);
  chargesByStudent.get(c.studentId).push(c);
});

const inList = (s) => {
  if (s.chargeHistoryReviewed) return false;
  const own = chargesByStudent.get(s.id) ?? [];
  if (own.length === 0) return true;
  return own.length === 1 && own[0].month === CURRENT_MONTH;
};

const list = students.filter(inList);
console.log(`В списке "без истории списаний": ${list.length}\n`);
list
  .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''))
  .forEach((s) => {
    console.log(`${(s.fullName || '').padEnd(30)} phone=${s.phone}  balance=${s.balance}`);
  });
process.exit(0);
