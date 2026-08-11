import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { writeTransaction } from '../src/lib/billing.js';
const firebaseConfig = { apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN, projectId: process.env.VITE_FB_PROJECT_ID, storageBucket: process.env.VITE_FB_STORAGE_BUCKET, messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID, appId: process.env.VITE_FB_APP_ID };
const app = initializeApp(firebaseConfig);
const { user } = await signInWithEmailAndPassword(getAuth(app), process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const db = getFirestore(app);
await writeTransaction(db, {
  branchId: 'icon-main',
  studentId: 'DSwmlBDYsc9sfGmJz3IT',
  studentName: 'Sharifabonu Ahrorjonova',
  enrollmentId: null, groupId: null, groupCode: null, teacherId: null, teacherName: null,
  type: 'correction',
  amount: 990000,
  method: null,
  date: new Date(),
  month: new Date().toISOString().slice(0, 7),
  comment: 'Сверка баланса со старой системой (icon.modme.uz)',
  periodFrom: null, periodTo: null, lessonsCount: null,
  createdBy: user.uid,
  createdByName: 'Doniyor Shavkatov',
});
console.log('Готово.');
process.exit(0);
