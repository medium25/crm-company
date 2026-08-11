/**
 * Вторая волна "ушли из активной группы" — 7 новых записей, появившихся
 * в старой системе после первого прохода (backfill-left-active-group.mjs).
 * Тот же паттерн: enrollment status -> left, decrement group.studentsCount
 * только если ещё не archived.
 *
 *   node --env-file=.env scripts/backfill-left-active-group-2.mjs           # dry-run
 *   node --env-file=.env scripts/backfill-left-active-group-2.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, increment, Timestamp, serverTimestamp } from 'firebase/firestore';
import { recomputeStudentAggregates } from '../src/lib/students.js';

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

const RECORDS = [
  { name: 'Tohir Toirjonov', phone: '933735075', group: 'R14', date: '2026-08-11' },
  { name: 'Sarvinoz Mamurjonova', phone: '882061507', group: 'R34', date: '2026-08-10' },
  { name: 'Mohir Abdurauffov', phone: '700518370', group: 'R34', date: '2026-08-10' },
  { name: 'Fazliddin Lutfullayev', phone: '931427252', group: 'I7', date: '2026-08-10' },
  { name: 'Muslima Jamalova', phone: '998947557', group: 'I6', date: '2026-08-10' },
  { name: 'Muxsina Javalova', phone: '977481872', group: 'I6', date: '2026-08-10' },
  { name: 'Abror Alijonov', phone: '904809313', group: 'R33', date: '2026-08-10' },
];

const onlyDigits = (s) => (s || '').replace(/\D/g, '');
const last9 = (s) => onlyDigits(s).slice(-9);

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
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
  const enrollmentsSnap = await getDocs(query(collection(db, 'enrollments'), where('branchId', '==', BRANCH_ID)));
  const enrollmentsByStudent = new Map();
  enrollmentsSnap.forEach((d) => {
    const e = { id: d.id, ...d.data() };
    if (!enrollmentsByStudent.has(e.studentId)) enrollmentsByStudent.set(e.studentId, []);
    enrollmentsByStudent.get(e.studentId).push(e);
  });

  const plan = [];
  for (const r of RECORDS) {
    const student = byPhone.get(last9(r.phone));
    if (!student) { console.log(`НЕ НАЙДЕН: ${r.name} ${r.phone}`); continue; }
    const group = groupsByCode.get(r.group);
    const enrollments = enrollmentsByStudent.get(student.id) ?? [];
    const enr = (group && enrollments.find((e) => e.groupId === group.id)) ?? enrollments.find((e) => e.status === 'active');
    if (!enr || enr.status === 'left') continue;
    plan.push({ r, student, enrollment: enr });
  }

  console.log('\nПлан:');
  plan.forEach((p) => console.log(`  ${p.r.name} ${p.r.phone} group=${p.r.group} enrollmentStatus=${p.enrollment.status} -> left`));

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  const touched = new Set();
  for (const p of plan) {
    const leftAt = Timestamp.fromDate(new Date(p.r.date));
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(db, 'enrollments', p.enrollment.id), {
      status: 'left',
      leftAt,
      leftReason: 'Без причины',
      statusLabel: 'Ушёл',
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    if (p.enrollment.status !== 'archived') {
      // eslint-disable-next-line no-await-in-loop
      await updateDoc(doc(db, 'groups', p.enrollment.groupId), { studentsCount: increment(-1) });
    }
    touched.add(p.student.id);
    console.log(`Обновлён: ${p.r.name}`);
  }
  for (const id of touched) {
    // eslint-disable-next-line no-await-in-loop
    await recomputeStudentAggregates(db, id);
  }
  console.log('\nГотово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
