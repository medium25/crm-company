/**
 * Правило «пробные»: создан пробным (trialAt) и прикреплён учитель+группа. Списки и дашборд строятся по trialDate, а
 * «Добавить пробного»/«Добавить ученика» (StudentFormModal) раньше писали только trialAt — такие пробные выпадали из «На пробном уроке»
 * и «Пробные за месяц». Скрипт ставит trialDate = trialAt студентам, у которых trialAt есть, trialDate нет и есть запись у учителя.
 * Больше ничего не меняет.
 *
 *   node --env-file=.env scripts/backfill-manual-trial-date.mjs           # dry-run
 *   node --env-file=.env scripts/backfill-manual-trial-date.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const BRANCH = process.env.BRANCH_ID || 'icon-main';
const app = initializeApp({
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
});
const db = getFirestore(app);
await signInWithEmailAndPassword(getAuth(app), process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const [snap, enrSnap] = await Promise.all([
  getDocs(query(collection(db, 'students'), where('branchId', '==', BRANCH))),
  getDocs(query(collection(db, 'enrollments'), where('branchId', '==', BRANCH))),
]);
const withTeacher = new Set(enrSnap.docs.map((d) => d.data()).filter((e) => e.teacherName).map((e) => e.studentId));
const todo = snap.docs.filter((d) => d.data().trialAt && !d.data().trialDate && withTeacher.has(d.id));
console.log(`Студентов: ${snap.size}, без trialDate при trialAt и учителе: ${todo.length}`);
for (const d of todo) {
  const s = d.data();
  console.log(`${APPLY ? 'FIX ' : 'would fix '}${d.id}  ${s.fullName}  ${s.phone}  trialAt=${s.trialAt.toDate().toISOString()}  stage=${s.funnelStage} status=${s.status}`);
  if (APPLY) await updateDoc(doc(db, 'students', d.id), { trialDate: s.trialAt });
}
console.log(APPLY ? 'Готово.' : 'Dry-run: ничего не записано. Добавь --apply.');
process.exit(0);
