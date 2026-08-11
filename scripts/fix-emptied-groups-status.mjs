/**
 * I12 и I5 остались status=active со studentsCount=0 после того как все
 * студенты ушли (backfill-left-active-group.mjs/backfill-trial-enrollments.mjs
 * перевели их в left/новую группу) — в старой системе (icon.modme.uz) обе
 * группы уже status=3 ("завершена"), у нас автозакрытия группы при
 * studentsCount=0 нет. Разово доводим до finished, раз уж это реальное
 * следствие только что сделанного бэкафилла.
 *
 *   node --env-file=.env scripts/fix-emptied-groups-status.mjs           # dry-run
 *   node --env-file=.env scripts/fix-emptied-groups-status.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const GROUP_IDS = ['hAZBsWkmOMj2RuUJERco', 'BW1tmdjeXYNdoPqRAvSt']; // I12, I5

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  for (const id of GROUP_IDS) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDoc(doc(db, 'groups', id));
    const g = snap.data();
    console.log(`${g.code}: status=${g.status} studentsCount=${g.studentsCount}`);
    if (!APPLY) continue;
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(db, 'groups', id), { status: 'finished', updatedAt: serverTimestamp(), updatedBy: user.uid });
    console.log(`  -> finished`);
  }

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }
  console.log('\nГотово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
