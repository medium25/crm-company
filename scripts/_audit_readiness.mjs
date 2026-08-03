/**
 * READ-ONLY аудит готовности к отказу от modme и переходу на новую CRM.
 * Ничего не пишет в базу. Печатает срез: счётчики, аномалии, статус фаз.
 *
 *   node --env-file=.env scripts/_audit_readiness.mjs
 */
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

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const studentsSnap = await getDocs(collection(db, 'students'));
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const activeStudents = students.filter((s) => !s.isArchived);
  console.log(`\n=== STUDENTS ===`);
  console.log(`Всего: ${students.length}, активных (isArchived=false): ${activeStudents.length}, архив: ${students.length - activeStudents.length}`);

  const groupsSnap = await getDocs(collection(db, 'groups'));
  const groups = groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const activeGroups = groups.filter((g) => !g.isArchived);
  console.log(`\n=== GROUPS ===`);
  console.log(`Всего: ${groups.length}, активных: ${activeGroups.length}`);
  console.log('Активные группы:', activeGroups.map((g) => g.code || g.id).sort().join(', '));

  const enrollSnap = await getDocs(collection(db, 'enrollments'));
  const enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const activeEnroll = enrollments.filter((e) => !e.isArchived);
  console.log(`\n=== ENROLLMENTS ===`);
  console.log(`Всего: ${enrollments.length}, активных: ${activeEnroll.length}`);
  const noActivatedAt = activeEnroll.filter((e) => !e.activatedAt && e.status === 'active');
  console.log(`Активные без activatedAt (статус active, но нет даты): ${noActivatedAt.length}`);
  if (noActivatedAt.length) console.log(noActivatedAt.map((e) => e.studentName + ' / ' + e.groupCode).join('\n'));

  const teachersSnap = await getDocs(collection(db, 'teachers'));
  const teachers = teachersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`\n=== TEACHERS === Всего: ${teachers.length}`);
  teachers.forEach((t) => console.log(`  ${t.id}: ${t.displayName || t.fullName}, groupsCount=${t.groupsCount}`));

  const txSnap = await getDocs(collection(db, 'transactions'));
  const txs = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`\n=== TRANSACTIONS === Всего: ${txs.length}`);
  const byType = {};
  let sumPayments = 0, sumCharges = 0;
  txs.forEach((t) => {
    byType[t.type] = (byType[t.type] || 0) + 1;
    if (t.type === 'payment') sumPayments += t.amount;
    if (t.type === 'charge') sumCharges += t.amount;
  });
  console.log('По типам:', byType);
  console.log(`Сумма payment: ${sumPayments.toLocaleString()} UZS, сумма charge: ${sumCharges.toLocaleString()} UZS`);
  const reversed = txs.filter((t) => t.isReversed);
  console.log(`Сторнированных: ${reversed.length}`);

  console.log(`\n=== BALANCE SANITY ===`);
  const balanceSum = activeStudents.reduce((s, st) => s + (st.balance || 0), 0);
  console.log(`Сумма balance активных студентов: ${balanceSum.toLocaleString()} UZS`);
  const noBalanceUpdated = activeStudents.filter((s) => !s.balanceUpdatedAt);
  console.log(`Активных студентов без balanceUpdatedAt: ${noBalanceUpdated.length}`);

  const lessonsSnap = await getDocs(collection(db, 'lessons'));
  console.log(`\n=== LESSONS === Всего документов: ${lessonsSnap.size}`);
  const months = new Set();
  lessonsSnap.forEach((d) => months.add(d.data().month));
  console.log('Месяцы с уроками:', [...months].sort().join(', '));

  console.log(`\n=== АНОМАЛИИ ===`);
  const dupPhones = {};
  activeStudents.forEach((s) => {
    if (!s.phone) return;
    dupPhones[s.phone] = (dupPhones[s.phone] || []);
    dupPhones[s.phone].push(s.fullName);
  });
  Object.entries(dupPhones).filter(([, v]) => v.length > 1).forEach(([phone, names]) => {
    console.log(`Дублирующийся телефон ${phone}: ${names.join(', ')}`);
  });

  const noEnrollment = activeStudents.filter((s) => !activeEnroll.some((e) => e.studentId === s.id));
  console.log(`Активных студентов без единого активного enrollment: ${noEnrollment.length}`);
  if (noEnrollment.length) console.log(noEnrollment.map((s) => s.fullName).join(', '));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
