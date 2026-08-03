/**
 * Догоняющий перенос — платежи и студенты, добавленные в modme после
 * снимка Phase 1/2 (25.07.2026 ~11:30) до 01.08.2026 включительно.
 * Собрано вручную через Browser pane 02.08.2026.
 *
 * Делает:
 *  1. 12 новых студентов (которых не было в Phase 1) + по одному зачислению каждому.
 *  2. 20 новых транзакций-платежей (14 для новых студентов, 6 для уже существующих).
 *  3. Инкремент balance у 4 уже существующих студентов, у которых просто не
 *     хватало платежей (не increment для новых — им balance проставляется
 *     напрямую как снимок из modme, по той же логике что Phase 1).
 *  4. +1 (или +2) к groups.studentsCount у затронутых групп.
 *
 *   node --env-file=.env scripts/_migrate_delta_20260801.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const BRANCH_ID = 'icon-main';

function ts(dateStr) {
  return Timestamp.fromDate(new Date(`${dateStr}T00:00:00`));
}
function tsDt(dateTimeStr) {
  return Timestamp.fromDate(new Date(dateTimeStr));
}
function phoneToDigits(raw) {
  return '998' + raw.replace(/\D/g, '');
}
function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

// { name, phone, birthDate|null, accountAddedAt, balance,
//   enrollment: { groupCode, price, addedAt, activatedAt, courseNameOverride? },
//   payments: [{ dateTime, amount, method }] }
const NEW_STUDENTS = [
  {
    name: 'Malika Fattoyeva',
    phone: '50 880 27 77',
    birthDate: null,
    accountAddedAt: '2026-08-01',
    balance: 0,
    enrollment: { groupCode: 'R42', price: 910000, addedAt: '2026-07-30', activatedAt: '2026-08-01' },
    payments: [{ dateTime: '2026-08-01T18:06:39', amount: 910000, method: 'cash' }],
  },
  {
    name: 'Sharifabonu Ahrorjonova',
    phone: '90 924 41 41',
    birthDate: null,
    accountAddedAt: '2026-08-01',
    balance: 10000,
    enrollment: { groupCode: 'R41', price: 840000, addedAt: '2026-07-28', activatedAt: '2026-07-28' },
    payments: [{ dateTime: '2026-08-01T15:16:34', amount: 990000, method: 'click' }],
  },
  {
    name: 'Sarvinoz Muhammadkulova',
    phone: '93 347 23 28',
    birthDate: null,
    accountAddedAt: '2026-07-31',
    balance: -620000,
    enrollment: { groupCode: 'R6', price: 840000, addedAt: '2026-07-31', activatedAt: '2026-07-31' },
    payments: [
      { dateTime: '2026-07-31T18:43:09', amount: 80000, method: 'click' },
      { dateTime: '2026-07-31T18:42:16', amount: 200000, method: 'cash' },
    ],
  },
  {
    name: 'Axmadxon Shuxratov',
    phone: '77 005 55 58',
    birthDate: null,
    accountAddedAt: '2026-07-31',
    balance: 780000,
    enrollment: { groupCode: 'R7', price: 840000, addedAt: '2026-07-22', activatedAt: '2026-07-31' },
    payments: [{ dateTime: '2026-07-31T18:26:06', amount: 1680000, method: 'cash' }],
  },
  {
    name: 'Muhammadiev Bekzod',
    phone: '99 080 86 64',
    birthDate: null,
    accountAddedAt: '2026-07-30',
    balance: -64615,
    enrollment: { groupCode: 'R37', price: 840000, addedAt: '2026-07-28', activatedAt: '2026-07-30' },
    payments: [{ dateTime: '2026-07-30T10:13:45', amount: 840000, method: 'cash' }],
  },
  {
    name: 'Shuxrat Ashurov',
    phone: '97 895 09 05',
    birthDate: null,
    accountAddedAt: '2026-07-29',
    balance: -54615,
    enrollment: { groupCode: 'R14', price: 840000, addedAt: '2026-07-27', activatedAt: '2026-07-29' },
    payments: [{ dateTime: '2026-07-29T18:23:01', amount: 850000, method: 'cash' }],
  },
  {
    name: 'Ziyayeva Madina',
    phone: '99 138 83 68',
    birthDate: null,
    accountAddedAt: '2026-07-28',
    balance: -549231,
    enrollment: { groupCode: 'R37', price: 840000, addedAt: '2026-07-19', activatedAt: '2026-07-28' },
    payments: [{ dateTime: '2026-07-28T12:43:27', amount: 420000, method: 'cash' }],
  },
  {
    name: 'Sultonova Komila',
    phone: '99 118 69 79',
    birthDate: null,
    accountAddedAt: '2026-07-28',
    balance: -129231,
    enrollment: { groupCode: 'R36', price: 840000, addedAt: '2026-07-28', activatedAt: '2026-07-28' },
    payments: [
      { dateTime: '2026-07-28T10:38:09', amount: 100000, method: 'cash' },
      { dateTime: '2026-07-28T10:37:54', amount: 740000, method: 'click' },
    ],
  },
  {
    name: 'Mubina Muminova',
    phone: '88 877 88 09',
    birthDate: null,
    accountAddedAt: '2026-07-27',
    balance: -445000,
    enrollment: { groupCode: 'I6', price: 890000, addedAt: '2026-07-24', activatedAt: '2026-08-01' },
    payments: [{ dateTime: '2026-07-27T17:05:20', amount: 445000, method: 'cash' }],
  },
  {
    name: "Bilol Jo'rayev",
    phone: '90 068 44 77',
    birthDate: null,
    accountAddedAt: '2026-07-27',
    balance: -170000,
    enrollment: { groupCode: 'R4', price: 840000, addedAt: '2026-07-22', activatedAt: '2026-07-27' },
    payments: [{ dateTime: '2026-07-27T14:18:32', amount: 850000, method: 'cash' }],
  },
  {
    name: 'Zuhriddin Qayimov',
    phone: '93 469 00 02',
    birthDate: null,
    accountAddedAt: '2026-07-25',
    balance: 460000,
    enrollment: { groupCode: 'MINI 2', price: 840000, addedAt: '2026-07-23', activatedAt: '2026-07-31' },
    payments: [{ dateTime: '2026-07-25T20:06:52', amount: 1300000, method: 'cash' }],
  },
  {
    name: 'Nodira Jumanazarova',
    phone: '77 960 73 77',
    birthDate: '2004-03-27',
    accountAddedAt: '2025-01-27',
    balance: 114,
    enrollment: { groupCode: 'R34', price: 840000, addedAt: '2026-08-01', activatedAt: '2026-08-01' },
    payments: [{ dateTime: '2026-07-30T18:53:22', amount: 840000, method: 'click' }],
  },
];

// { fullName, groupCodeForTx, payments: [{dateTime, amount, method}] } — уже
// существуют в базе (Phase 1), просто не хватало этих платежей.
const EXISTING_STUDENTS = [
  {
    fullName: 'Zubayr Ahromov',
    payments: [
      { dateTime: '2026-07-27T14:34:34', amount: 840000, method: 'cash', groupCode: 'R3' },
      { dateTime: '2026-07-31T18:16:01', amount: 490000, method: 'click', groupCode: 'R4' },
    ],
  },
  {
    fullName: 'Lobar Tadjimirzayeva',
    payments: [{ dateTime: '2026-07-28T14:57:54', amount: 440000, method: 'cash', groupCode: 'R40' }],
  },
  {
    fullName: 'Jaloliddin Xasanov',
    payments: [
      { dateTime: '2026-07-30T18:40:22', amount: 30000, method: 'cash', groupCode: 'I14' },
      { dateTime: '2026-07-30T18:39:37', amount: 320000, method: 'cash', groupCode: 'I14' },
    ],
  },
  {
    fullName: "Asliddin G'apporov",
    payments: [{ dateTime: '2026-07-31T19:12:31', amount: 200000, method: 'click', groupCode: 'R32' }],
  },
];

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) throw new Error('Задай SEED_ADMIN_EMAIL/PASSWORD');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('isArchived', '==', false)));
  const groupByCode = new Map();
  groupsSnap.forEach((d) => groupByCode.set(d.data().code, { id: d.id, ...d.data() }));

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('isArchived', '==', false)));
  const studentByName = new Map();
  let maxPublicId = 0;
  studentsSnap.forEach((d) => {
    studentByName.set(d.data().fullName, { id: d.id, ...d.data() });
    if (d.data().publicId > maxPublicId) maxPublicId = d.data().publicId;
  });

  const groupStudentIncrements = new Map(); // groupId -> count

  // --- 1+2: новые студенты + зачисления + их платежи ---
  let nextPublicId = maxPublicId + 1;
  let txCount = 0;
  let txSum = 0;
  const batch1 = writeBatch(db);
  for (const s of NEW_STUDENTS) {
    const g = groupByCode.get(s.enrollment.groupCode);
    if (!g) throw new Error(`Группа не найдена: ${s.enrollment.groupCode}`);

    const studentRef = doc(collection(db, 'students'));
    batch1.set(studentRef, {
      id: studentRef.id,
      branchId: BRANCH_ID,
      publicId: nextPublicId++,
      fullName: s.name,
      phone: phoneToDigits(s.phone),
      phone2: null,
      birthDate: s.birthDate ? ts(s.birthDate) : null,
      gender: null,
      photoUrl: null,
      status: 'active',
      statusReason: null,
      source: null,
      balance: s.balance,
      balanceUpdatedAt: serverTimestamp(),
      note: '',
      isFlagged: false,
      activeGroupsCount: 1,
      firstPaymentAt: tsDt(s.payments[0].dateTime),
      lastPaymentAt: tsDt(s.payments[s.payments.length - 1].dateTime),
      trialAt: null,
      leftAt: null,
      createdAt: ts(s.accountAddedAt),
      createdBy: uid,
      isArchived: false,
    });

    const enrollRef = doc(collection(db, 'enrollments'));
    batch1.set(enrollRef, {
      id: enrollRef.id,
      branchId: BRANCH_ID,
      studentId: studentRef.id,
      studentName: s.name,
      groupId: g.id,
      groupCode: g.code,
      courseName: g.courseName,
      teacherId: g.teacherId,
      teacherName: g.teacherName,
      status: 'active',
      statusLabel: 'Активен (Оплачивает обучение)',
      price: s.enrollment.price,
      discountPercent: 0,
      discountReason: '',
      addedAt: ts(s.enrollment.addedAt),
      activatedAt: ts(s.enrollment.activatedAt),
      pausedFrom: null,
      pausedTo: null,
      leftAt: null,
      leftReason: null,
      lastChargedMonth: null,
      isArchived: false,
      createdBy: uid,
      createdAt: ts(s.enrollment.addedAt),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });

    for (const p of s.payments) {
      const txRef = doc(collection(db, 'transactions'));
      batch1.set(txRef, {
        id: txRef.id,
        branchId: BRANCH_ID,
        studentId: studentRef.id,
        studentName: s.name,
        enrollmentId: enrollRef.id,
        groupId: g.id,
        groupCode: g.code,
        teacherId: g.teacherId,
        teacherName: g.teacherName,
        type: 'payment',
        amount: p.amount,
        method: p.method,
        date: ts(p.dateTime.slice(0, 10)),
        month: monthOf(p.dateTime),
        comment: '',
        periodFrom: null,
        periodTo: null,
        lessonsCount: null,
        createdBy: uid,
        createdByName: 'Mr Abduganiev',
        createdAt: tsDt(p.dateTime),
        isReversed: false,
        reversedBy: null,
      });
      txCount++;
      txSum += p.amount;
    }

    groupStudentIncrements.set(g.id, (groupStudentIncrements.get(g.id) ?? 0) + 1);
  }
  await batch1.commit();
  console.log(`Новых студентов создано: ${NEW_STUDENTS.length}`);

  // --- 3: платежи существующим студентам + инкремент баланса ---
  const batch2 = writeBatch(db);
  for (const es of EXISTING_STUDENTS) {
    const student = studentByName.get(es.fullName);
    if (!student) throw new Error(`Студент не найден в базе: ${es.fullName}`);

    let sum = 0;
    for (const p of es.payments) {
      const g = groupByCode.get(p.groupCode);
      if (!g) throw new Error(`Группа не найдена: ${p.groupCode}`);
      const txRef = doc(collection(db, 'transactions'));
      batch2.set(txRef, {
        id: txRef.id,
        branchId: BRANCH_ID,
        studentId: student.id,
        studentName: student.fullName,
        enrollmentId: null,
        groupId: g.id,
        groupCode: g.code,
        teacherId: g.teacherId,
        teacherName: g.teacherName,
        type: 'payment',
        amount: p.amount,
        method: p.method,
        date: ts(p.dateTime.slice(0, 10)),
        month: monthOf(p.dateTime),
        comment: '',
        periodFrom: null,
        periodTo: null,
        lessonsCount: null,
        createdBy: uid,
        createdByName: 'Mr Abduganiev',
        createdAt: tsDt(p.dateTime),
        isReversed: false,
        reversedBy: null,
      });
      txCount++;
      txSum += p.amount;
      sum += p.amount;
    }
    batch2.update(doc(db, 'students', student.id), {
      balance: increment(sum),
      lastPaymentAt: tsDt(es.payments[es.payments.length - 1].dateTime),
      balanceUpdatedAt: serverTimestamp(),
    });
  }
  await batch2.commit();
  console.log(`Существующим студентам добавлено платежей: ${EXISTING_STUDENTS.reduce((n, s) => n + s.payments.length, 0)}`);

  // --- 4: groups.studentsCount ---
  const batch3 = writeBatch(db);
  for (const [groupId, inc] of groupStudentIncrements) {
    batch3.update(doc(db, 'groups', groupId), { studentsCount: increment(inc) });
  }
  await batch3.commit();
  console.log('groups.studentsCount обновлён для', groupStudentIncrements.size, 'групп');

  console.log(`Всего транзакций записано: ${txCount}`);
  console.log(`Сумма: ${txSum.toLocaleString('ru-RU')} UZS`);
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
