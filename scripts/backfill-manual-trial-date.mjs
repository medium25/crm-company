/**
 * «Добавить пробного» (StudentFormModal, createMode 'trial_completed') раньше писал только trialAt, без trialDate —
 * из-за этого такие пробные не попадали ни в «Пробные за месяц» на дашборде, ни в «На пробном уроке» (оба строятся по trialDate).
 * Скрипт проставляет trialDate = trialAt тем, у кого пробный проведён (trial_completed/closing/won), trialAt есть, а trialDate нет.
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

const snap = await getDocs(
  query(collection(db, 'students'), where('branchId', '==', BRANCH), where('funnelStage', 'in', ['trial_completed', 'closing', 'won'])),
);
const todo = snap.docs.filter((d) => d.data().trialAt && !d.data().trialDate);
console.log(`Проведённых пробных: ${snap.size}, без trialDate: ${todo.length}`);
for (const d of todo) {
  const s = d.data();
  console.log(`${APPLY ? 'FIX ' : 'would fix '}${d.id}  ${s.fullName}  ${s.phone}  trialAt=${s.trialAt.toDate().toISOString()}  stage=${s.funnelStage}`);
  if (APPLY) await updateDoc(doc(db, 'students', d.id), { trialDate: s.trialAt });
}
console.log(APPLY ? 'Готово.' : 'Dry-run: ничего не записано. Добавь --apply.');
process.exit(0);
