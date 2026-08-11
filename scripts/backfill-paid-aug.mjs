/**
 * Бэкафилл "Оплатили в текущем месяце" за август 2026 — старая система
 * (branch_id=681) показывает 71 уникального плательщика (GET /v1/user
 * ?finance=paid_during_the_month), в новой Firestore — 66. Сверка по
 * телефону дала 6 недостающих (студенты есть, платежа за август нет).
 *
 * Суммы/метод/дата взяты из GET /v1/payment?branch_id=681&user_id={id}
 * (тот же API, что и rebuild-full-history.js) — debit>0 запись за
 * 01.08–10.08.2026 = реальный платёж (credit>0 — начисление за месяц,
 * не платёж, важно не перепутать направление).
 *
 *   node --env-file=.env scripts/backfill-paid-aug.mjs           # dry-run
 *   node --env-file=.env scripts/backfill-paid-aug.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { recordPayment } from '../src/lib/billing.js';

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

// name, phone (9 цифр без 998), сумма, метод, дата платежа, код группы.
const PAYMENTS = [
  { name: 'Sharifabonu Ahrorjonova', phone: '909244141', amount: 990000, method: 'click', date: '2026-08-01', group: 'R41' },
  { name: 'Shahlo Sayfuddinova', phone: '998027828', amount: 800000, method: 'cash', date: '2026-08-10', group: 'R5' },
  { name: 'Munisa Ammonova', phone: '901110045', amount: 700000, method: 'cash', date: '2026-08-10', group: 'R13' },
  { name: 'Asadbek Baxtiyorov', phone: '931382178', amount: 560000, method: 'click', date: '2026-08-08', group: null },
  { name: 'Shaxnur Axmedov', phone: '937777753', amount: 900000, method: 'cash', date: '2026-08-07', group: 'I6' },
  { name: 'Abbos Baxtiyev', phone: '935581381', amount: 10000000, method: 'cash', date: '2026-08-03', group: 'I14' },
];

const onlyDigits = (s) => (s || '').replace(/\D/g, '');
const last9 = (s) => onlyDigits(s).slice(-9);

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const staffUser = { uid: user.uid, fullName: 'Doniyor Shavkatov' };
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('branchId', '==', BRANCH_ID)));
  const byPhone = new Map();
  studentsSnap.forEach((d) => {
    const s = { id: d.id, ...d.data() };
    if (s.phone) byPhone.set(last9(s.phone), s);
    if (s.phone2) byPhone.set(last9(s.phone2), s);
  });

  const groupsSnap = await getDocs(collection(db, 'groups'));
  const groupsByCode = new Map();
  groupsSnap.forEach((d) => groupsByCode.set(d.data().code, { id: d.id, ...d.data() }));

  const plan = [];
  for (const p of PAYMENTS) {
    const student = byPhone.get(last9(p.phone));
    if (!student) {
      console.log(`СТОП: студент не найден ${p.name} ${p.phone}`);
      continue;
    }
    const group = p.group ? groupsByCode.get(p.group) : null;
    plan.push({ p, student, group });
  }

  console.log(`\nК добавлению: ${plan.length}`);
  plan.forEach(({ p, student }) => console.log(`  + ${p.name} ${p.amount} ${p.method} ${p.date} studentId=${student.id}`));

  if (!APPLY) {
    console.log('\ndry-run. Проверь список и запусти с --apply.');
    process.exit(0);
  }

  for (const { p, student, group } of plan) {
    // eslint-disable-next-line no-await-in-loop
    await recordPayment(
      db,
      {
        student,
        branchId: BRANCH_ID,
        amount: p.amount,
        method: p.method,
        date: new Date(`${p.date}T12:00:00`),
        comment: '',
        groupId: group?.id ?? null,
        groupCode: group?.code ?? null,
      },
      staffUser,
    );
    console.log(`Оплата записана: ${p.name}`);
  }
  console.log('\nГотово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
