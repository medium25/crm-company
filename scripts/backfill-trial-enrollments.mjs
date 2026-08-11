/**
 * Бэкафилл "В пробном уроке" — старая система показывает 10-11 активных
 * пробных на branch_id=681 (GET /v1/user?user_type=student&statuses=1), в
 * новой Firestore было 6. Разница объясняется тем же паттерном, что и
 * "Ушли из активной группы": часть этих студентов УЖЕ есть в нашей базе
 * (мы их находили как участников старой группы, откуда они ушли —
 * backfill-left-active-group.mjs как раз обработал их leftAt), но запись о
 * новом пробном enrollment в другую группу никогда не переносилась —
 * recomputeStudentAggregates честно посчитал их status=left, потому что
 * enrollment на новую группу физически отсутствует.
 *
 * Источник: old_trial.json рядом со скриптом, снят 10.08.2026 через API
 * modme из авторизованной вкладки.
 *
 * На студента:
 *  - студент уже существует, enrollment для нужной группы отсутствует ->
 *    создать enrollment status=trial (как AddToGroupModal), group.studentsCount+1,
 *    recomputeStudentAggregates.
 *  - студент уже существует, enrollment есть и status=trial -> пропустить,
 *    уже корректно.
 *  - студента нет вообще -> создать student (status=trial) + enrollment.
 *
 *   node --env-file=.env scripts/backfill-trial-enrollments.mjs           # dry-run
 *   node --env-file=.env scripts/backfill-trial-enrollments.mjs --apply
 */
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  addDoc,
  updateDoc,
  increment,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
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
    '/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/682c14fc-d11d-4a74-8098-1a63f17ed1e6/scratchpad/old_trial.json',
    'utf8',
  ),
);

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

  const createStudentPlan = [];
  const createEnrollmentPlan = [];
  const skip = [];

  for (const o of OLD) {
    const group = groupsByCode.get(o.group);
    if (!group) {
      console.log(`СТОП: группа ${o.group} не найдена в новой базе, пропускаю ${o.name}`);
      continue;
    }
    let student = byPhone.get(last9(o.phone));
    if (!student) {
      createStudentPlan.push({ old: o, group });
      continue;
    }
    const enrollments = enrollmentsByStudent.get(student.id) ?? [];
    const enr = enrollments.find((e) => e.groupId === group.id);
    if (enr) {
      if (enr.status !== 'trial') console.log(`ВНИМАНИЕ: ${o.name} уже есть enrollment для ${o.group}, но status=${enr.status}, не трогаю`);
      skip.push(o);
      continue;
    }
    createEnrollmentPlan.push({ old: o, group, student });
  }

  console.log(`\nВсего в старой выгрузке: ${OLD.length}`);
  console.log(`Уже корректно (enrollment trial существует): ${skip.length}`);
  console.log(`Студент есть, нужно создать enrollment: ${createEnrollmentPlan.length}`);
  createEnrollmentPlan.forEach((p) => console.log(`  + enrollment: ${p.old.name} -> group=${p.old.group}`));
  console.log(`Студента нет вообще, создать студента+enrollment: ${createStudentPlan.length}`);
  createStudentPlan.forEach((p) => console.log(`  + student+enrollment: ${p.old.name} ${p.old.phone} -> group=${p.old.group}`));

  if (!APPLY) {
    console.log('\ndry-run. Проверь список и запусти с --apply.');
    process.exit(0);
  }

  const touchedStudents = new Set();

  for (const p of createEnrollmentPlan) {
    const { old: o, group, student } = p;
    // eslint-disable-next-line no-await-in-loop
    await addDoc(collection(db, 'enrollments'), {
      branchId: BRANCH_ID,
      studentId: student.id,
      studentName: student.fullName,
      groupId: group.id,
      groupCode: group.code,
      courseName: group.courseName,
      teacherId: group.teacherId,
      teacherName: group.teacherName,
      status: 'trial',
      statusLabel: 'Пробный урок',
      price: o.price,
      discountPercent: 0,
      discountReason: '',
      addedAt: Timestamp.fromDate(new Date(o.created_at)),
      activatedAt: null,
      pausedFrom: null,
      pausedTo: null,
      leftAt: null,
      leftReason: null,
      lastChargedMonth: null,
      isArchived: false,
      createdAt: Timestamp.fromDate(new Date(o.created_at)),
      createdBy: user.uid,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(db, 'groups', group.id), { studentsCount: increment(1) });
    touchedStudents.add(student.id);
    console.log(`Enrollment создан: ${o.name} -> ${o.group}`);
  }

  for (const p of createStudentPlan) {
    const { old: o, group } = p;
    // eslint-disable-next-line no-await-in-loop
    const studentRef = await addDoc(collection(db, 'students'), {
      fullName: o.name.trim(),
      phone: onlyDigits(o.phone),
      phone2: null,
      source: null,
      branchId: BRANCH_ID,
      publicId: Math.floor(1000000 + Math.random() * 9000000),
      birthDate: null,
      gender: null,
      photoUrl: null,
      status: 'trial',
      statusReason: null,
      leadStage: null,
      leadResult: null,
      balance: 0,
      balanceUpdatedAt: serverTimestamp(),
      note: '',
      isFlagged: false,
      activeGroupsCount: 0,
      firstPaymentAt: null,
      lastPaymentAt: null,
      trialAt: Timestamp.fromDate(new Date(o.created_at)),
      leftAt: null,
      createdAt: Timestamp.fromDate(new Date(o.created_at)),
      createdBy: user.uid,
      isArchived: false,
    });
    // eslint-disable-next-line no-await-in-loop
    await addDoc(collection(db, 'enrollments'), {
      branchId: BRANCH_ID,
      studentId: studentRef.id,
      studentName: o.name.trim(),
      groupId: group.id,
      groupCode: group.code,
      courseName: group.courseName,
      teacherId: group.teacherId,
      teacherName: group.teacherName,
      status: 'trial',
      statusLabel: 'Пробный урок',
      price: o.price,
      discountPercent: 0,
      discountReason: '',
      addedAt: Timestamp.fromDate(new Date(o.created_at)),
      activatedAt: null,
      pausedFrom: null,
      pausedTo: null,
      leftAt: null,
      leftReason: null,
      lastChargedMonth: null,
      isArchived: false,
      createdAt: Timestamp.fromDate(new Date(o.created_at)),
      createdBy: user.uid,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(db, 'groups', group.id), { studentsCount: increment(1) });
    console.log(`Студент+enrollment созданы: ${o.name} ${o.phone} -> ${o.group}`);
  }

  for (const studentId of touchedStudents) {
    // eslint-disable-next-line no-await-in-loop
    await recomputeStudentAggregates(db, studentId);
  }
  console.log(`\nГотово. Enrollments создано: ${createEnrollmentPlan.length}, студентов создано: ${createStudentPlan.length}, пересчитано: ${touchedStudents.size}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
