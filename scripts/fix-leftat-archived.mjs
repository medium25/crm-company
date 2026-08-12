/**
 * 3 enrollment'а (Munisa Nazirova/R4, Diyorbek Radjapov/I6, Izzatilla
 * Mahmudov/R33) архивированы сотрудником напрямую 11-12.08.2026 без leftAt —
 * дата ухода совпадает со старой системой построчно, просто не была
 * записана. Проставляем leftAt = updatedAt (момент архивации) + leftReason,
 * как для обычного ухода — чтобы countLeftActiveGroup их не терял.
 *
 *   node --env-file=.env scripts/fix-leftat-archived.mjs           # dry-run
 *   node --env-file=.env scripts/fix-leftat-archived.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, writeBatch } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID, storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID, appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

const targets = [
  { name: 'Munisa Nazirova', group: 'R4' },
  { name: 'Diyorbek Radjapov', group: 'I6' },
  { name: 'Izzatilla Mahmudov', group: 'R33' },
];

const batch = writeBatch(db);
for (const t of targets) {
  const eSnap = await getDocs(query(collection(db, 'enrollments'), where('studentName', '==', t.name), where('groupCode', '==', t.group)));
  const d = eSnap.docs[0];
  const e = d.data();
  console.log(t.name, t.group, '-> leftAt сейчас:', e.leftAt, ', ставим:', e.updatedAt.toDate().toISOString());
  if (APPLY) {
    batch.update(doc(db, 'enrollments', d.id), { leftAt: e.updatedAt, leftReason: e.leftReason ?? 'Sababsiz' });
  }
}
if (APPLY) {
  await batch.commit();
  console.log('Готово.');
}
process.exit(0);
