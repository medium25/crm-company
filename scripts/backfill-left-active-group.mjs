/**
 * Бэкафилл "Ушли из активной группы" за август 2026 — старая система
 * (icon.modme.uz, branch_id=681) показывает 35 за месяц (её собственный KPI
 * скоуп — текущий календарный месяц, подтверждено сверкой /v1/dashboard
 * gone_active_students с /v1/leftGroupUsers?date_from=2026-08-01), в новой
 * Firestore на момент проверки только 4 enrollment были доведены до
 * status=left правильным путём (через "Вывести из группы" в приложении).
 *
 * Источник: снято 10.08.2026 через API modme из авторизованной вкладки
 * (GET /v1/leftGroupUsers?branch_id=681&date_from=2026-08-01&date_to=2026-08-10
 * &status[]=active&status[]=frozen) — old_left_aug.json рядом со скриптом.
 * Сопоставление по последним 9 цифрам телефона (старая система хранит без
 * кода страны 998).
 *
 * У 31 несовпадающей записи enrollment.status разный:
 *  - active/trial/paused — обычный случай, "вывод из группы" никогда не
 *    провели; decrement group.studentsCount ещё не был сделан.
 *  - archived (без leftAt, statusLabel="Активен") — обнаружено, что часть
 *    enrollments и раньше архивировалась разовыми скриптами (напр.
 *    archive-bobur.mjs) без выставления leftAt/leftReason; group.studentsCount
 *    для них не трогаем (не можем быть уверены, что не задвоим декремент —
 *    при архивации могли уже вычесть или нет), только доводим до
 *    status=left + leftAt/leftReason для корректной отчётности.
 *
 * После — recomputeStudentAggregates по всем затронутым студентам.
 *
 *   node --env-file=.env scripts/backfill-left-active-group.mjs           # dry-run
 *   node --env-file=.env scripts/backfill-left-active-group.mjs --apply
 */
import { readFileSync } from 'fs';
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

const OLD = JSON.parse(
  readFileSync(
    '/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/682c14fc-d11d-4a74-8098-1a63f17ed1e6/scratchpad/old_left_aug.json',
    'utf8',
  ),
);

const onlyDigits = (s) => (s || '').replace(/\D/g, '');
const last9 = (s) => onlyDigits(s).slice(-9);
const REASON_MAP = { Sababsiz: 'Без причины' };

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

  const enrollmentsSnap = await getDocs(query(collection(db, 'enrollments'), where('branchId', '==', BRANCH_ID)));
  const enrollmentsByStudent = new Map();
  enrollmentsSnap.forEach((d) => {
    const e = { id: d.id, ...d.data() };
    if (!enrollmentsByStudent.has(e.studentId)) enrollmentsByStudent.set(e.studentId, []);
    enrollmentsByStudent.get(e.studentId).push(e);
  });

  const groupsSnap = await getDocs(collection(db, 'groups'));
  const groupsByCode = new Map();
  groupsSnap.forEach((d) => groupsByCode.set(d.data().code, { id: d.id, ...d.data() }));

  const plan = [];
  const notFound = [];
  for (const o of OLD) {
    const student = byPhone.get(last9(o.phone));
    if (!student) {
      notFound.push(o);
      continue;
    }
    const enrollments = enrollmentsByStudent.get(student.id) ?? [];
    const group = groupsByCode.get(o.group);
    const enr = (group && enrollments.find((e) => e.groupId === group.id)) ?? enrollments.find((e) => e.status === 'active');
    if (!enr || enr.status === 'left') continue;
    plan.push({ old: o, student, enrollment: enr });
  }

  console.log(`\nВсего в старой выгрузке: ${OLD.length}, не найден студент: ${notFound.length}, к бэкафиллу: ${plan.length}`);
  for (const p of plan) {
    const decrement = p.enrollment.status !== 'archived';
    console.log(
      `  ${p.old.name} ${p.old.phone} group=${p.old.group} enrollmentStatus=${p.enrollment.status} -> left` +
        (decrement ? ' (+ studentsCount-1)' : ' (studentsCount не трогаем, уже archived)'),
    );
  }

  if (!APPLY) {
    console.log('\ndry-run. Проверь список и запусти с --apply.');
    process.exit(0);
  }

  const touchedStudents = new Set();
  for (const p of plan) {
    const leftAt = Timestamp.fromDate(new Date(p.old.updated_at));
    const leftReason = REASON_MAP[p.old.reason] ?? p.old.reason ?? '';
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(db, 'enrollments', p.enrollment.id), {
      status: 'left',
      leftAt,
      leftReason,
      statusLabel: 'Ушёл',
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    if (p.enrollment.status !== 'archived') {
      // eslint-disable-next-line no-await-in-loop
      await updateDoc(doc(db, 'groups', p.enrollment.groupId), { studentsCount: increment(-1) });
    }
    touchedStudents.add(p.student.id);
    console.log(`Обновлён: ${p.old.name}`);
  }

  for (const studentId of touchedStudents) {
    // eslint-disable-next-line no-await-in-loop
    await recomputeStudentAggregates(db, studentId);
  }
  console.log(`\nГотово. Enrollments обновлено: ${plan.length}, студентов пересчитано: ${touchedStudents.size}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
