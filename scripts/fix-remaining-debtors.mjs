/**
 * Финальная точечная сверка должников (поимённо, сейчас):
 *  - Asadbek Baxtiyorov: у нас isArchived=true, status=left, balance=+570000
 *    (мы же его архивировали в backfill-left-active-group.mjs — он реально
 *    уходил из R34 в июле). Но в августе у него новое начисление 840000
 *    (03.08) и платёж 560000 (08.08) в старой системе — он вернулся,
 *    старая система держит его действующим должником. Разархивирую,
 *    возвращаю в active, баланс -270000.
 *  - Muqaddas Jo`rayeva, Sarvinoz Muhammadkulova: расхождение <2% (500 и
 *    10000), в пределах шума предыдущих округлений — довожу до их числа
 *    той же корректирующей транзакцией, что и раньше.
 *
 *   node --env-file=.env scripts/fix-remaining-debtors.mjs           # dry-run
 *   node --env-file=.env scripts/fix-remaining-debtors.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { writeTransaction } from '../src/lib/billing.js';

const APPLY = process.argv.includes('--apply');
const BRANCH_ID = 'icon-main';
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const targets = [
    { id: '5vOFUudnqx1kFt6wkB1w', name: 'Asadbek Baxtiyorov', targetBalance: -270000, unarchive: true },
    { id: '2KxdBFJNENbcAQzlJTuS', name: 'Muqaddas Jo`rayeva', targetBalance: -625000 },
    { id: 'AuWwyKGFtvGO8iz0qBsZ', name: 'Sarvinoz Muhammadkulova', targetBalance: -630000 },
  ];

  const plan = [];
  for (const t of targets) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDoc(doc(db, 'students', t.id));
    const current = Math.round(snap.data().balance ?? 0);
    const correction = t.targetBalance - current;
    plan.push({ ...t, current, correction });
  }

  console.log('\nПлан:');
  plan.forEach((p) => console.log(`  ${p.name}: текущий=${p.current} -> целевой=${p.targetBalance} (коррекция ${p.correction > 0 ? '+' : ''}${p.correction})${p.unarchive ? ', + status=active isArchived=false' : ''}`));

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  for (const p of plan) {
    if (p.unarchive) {
      // eslint-disable-next-line no-await-in-loop
      await updateDoc(doc(db, 'students', p.id), {
        status: 'active',
        isArchived: false,
        statusReason: null,
        leftAt: null,
        archivedAt: null,
        activeGroupsCount: 0,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    }
    if (p.correction !== 0) {
      // eslint-disable-next-line no-await-in-loop
      await writeTransaction(db, {
        branchId: BRANCH_ID,
        studentId: p.id,
        studentName: p.name,
        enrollmentId: null,
        groupId: null,
        groupCode: null,
        teacherId: null,
        teacherName: null,
        type: 'correction',
        amount: p.correction,
        method: null,
        date: new Date(),
        month: new Date().toISOString().slice(0, 7),
        comment: 'Сверка баланса со старой системой (icon.modme.uz)',
        periodFrom: null,
        periodTo: null,
        lessonsCount: null,
        createdBy: user.uid,
        createdByName: 'Doniyor Shavkatov',
      });
    }
    console.log(`Готово: ${p.name}`);
  }
  console.log('\nГотово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
