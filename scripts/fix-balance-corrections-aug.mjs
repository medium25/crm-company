/**
 * Балансовая сверка со старой системой (icon.modme.uz) — построчно по
 * снапшоту /v1/user (330 записей, снят 10.08.2026), тот же паттерн что
 * sync-no-history-balances.js/fix-balance-mismatches.js в прошлых сессиях.
 * На каждого — одна корректирующая транзакция (type=correction) на
 * разницу между нашим текущим балансом и балансом старой системы.
 * Mahliyo Xasanova (дубль карточки) обработана отдельно в
 * fix-mahliyo-duplicate.mjs — сюда не входит.
 *
 *   node --env-file=.env scripts/fix-balance-corrections-aug.mjs           # dry-run
 *   node --env-file=.env scripts/fix-balance-corrections-aug.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
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

// id (наш Firestore id) -> целевой баланс (старая система, округлено).
const TARGETS = [
  { id: 'FXx2J01Hi9IJxo1a2qWz', name: 'Abbos Baxtiyev', target: 9183626 },
  { id: 'RLBiXOaMHVfTZikwf6IU', name: 'Maftuna Fozilova', target: 1000 },
  { id: 'DSwmlBDYsc9sfGmJz3IT', name: 'Sharifabonu Ahrorjonova', target: 0 },
  { id: 'vTgu1nKkD3YRkFb7aMBk', name: 'Robiya Saidganiyeva', target: 350000 },
  { id: 'zA84wGk7P8zHoClN7bIk', name: "Ulug'bek Usmonov", target: -840000 },
  { id: 'VHA77S1bek0S0nXCJcRj', name: "Nodirxo'ja Muzaffarov", target: -840000 },
  { id: 'QnQhQriBPtoFvltnvA8A', name: "Ziyoda Yo'ldosheva", target: 0 },
  { id: 'BHR2rLneg7yefSwCypvG', name: 'Munisa Ammonova', target: -40000 },
  { id: 'moNI3E7rabqNg5xun0iP', name: 'Elbek Sadriyev', target: -840000 },
  { id: '1RdxYU7XvbxU53opQ1WG', name: 'Zuhriddin Jamoliddinov', target: 775385 },
  { id: 'RNpXWQrShSXP5Upb7nk7', name: 'Sitora Egamberdiyeva', target: -1300000 },
  { id: 'jU7ugPo4OYmZIJnvKGAf', name: 'Saidabror G`aniyev', target: -890000 },
  { id: 'eQCHcOO5xWaONtF3Nvvx', name: 'Jasmina Tojiyeva', target: 74000 },
  { id: 'rwzHJYdLRHGYjYWfCAa0', name: 'Izzatilla Mahmudov', target: -840000 },
  { id: 'XXun4SAQUqMBpVkPSoVb', name: "Habiba To'xtasinova", target: 0 },
  { id: 'kbNZlhomnL9kAgyRuWAV', name: 'Mubina Inogamova', target: -830000 },
  { id: 'uPdpu112S1RAMHkJpytI', name: 'Asliddin Oybekov', target: 490000 },
  { id: 'S8o6510nFMeKYnUddFms', name: 'Sevinch Muxammadiyeva', target: 0 },
];

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const plan = [];
  for (const t of TARGETS) {
    // eslint-disable-next-line no-await-in-loop
    const snap = await getDoc(doc(db, 'students', t.id));
    if (!snap.exists()) {
      console.log(`СТОП: студент ${t.id} (${t.name}) не найден`);
      continue;
    }
    const student = { id: t.id, ...snap.data() };
    const current = Math.round(student.balance ?? 0);
    const correction = t.target - current;
    plan.push({ ...t, student, current, correction });
  }

  console.log('\nПлан коррекций:');
  plan.forEach((p) => console.log(`  ${p.name}: текущий=${p.current} -> целевой=${p.target} (коррекция ${p.correction > 0 ? '+' : ''}${p.correction})`));
  const total = plan.reduce((s, p) => s + Math.abs(p.correction), 0);
  console.log(`\nВсего к правке: ${plan.length}, сумма модулей коррекций: ${total}`);

  if (!APPLY) {
    console.log('\ndry-run. Проверь список и запусти с --apply.');
    process.exit(0);
  }

  for (const p of plan) {
    if (p.correction === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    await writeTransaction(db, {
      branchId: BRANCH_ID,
      studentId: p.id,
      studentName: p.student.fullName,
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
    console.log(`Скорректирован: ${p.name} (${p.correction > 0 ? '+' : ''}${p.correction})`);
  }
  console.log('\nГотово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
