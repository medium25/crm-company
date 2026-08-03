/**
 * 8 студентов из исходных 146 (Phase 1) больше не существуют в modme вообще
 * (не frozen/left — удалены полностью: не находятся ни по имени, ни по
 * телефону). У нас удаление запрещено правилами — архивируем (soft-delete),
 * как и Phase 1 поступал с dummy-записями.
 *
 *   node --env-file=.env scripts/_archive_deleted_20260802.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, serverTimestamp, increment, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const NAMES = [
  'Asilbek Jaxonov', 'Asilbek Saidov', "Dilafruz Nig'matjanova", 'Dinora Xurramova',
  'Doniyor Ismoilov', 'Jahongir G`oyibov', 'Saidazim Saidmurodov', 'Sevinchoy Rajabboyeva',
];

function ts(dateStr) {
  return Timestamp.fromDate(new Date(`${dateStr}T00:00:00`));
}
function tsDt(dateTimeStr) {
  return Timestamp.fromDate(new Date(dateTimeStr));
}
function phoneToDigits(raw) {
  return '998' + raw.replace(/\D/g, '');
}

// Shahlo Sayfuddinova — активна в modme с 13.07.2026, пропущена в Phase 1
// (снимок был на 25.07.2026, но её почему-то не подхватило). Добавляем
// студента + зачисление + оба её платежа 13.07.2026, как остальных.
const SHAHLO = {
  name: 'Shahlo Sayfuddinova',
  phone: '99 802 78 28',
  accountAddedAt: '2026-07-13',
  balance: -210000,
  enrollment: { groupCode: 'R5', price: 840000, addedAt: '2026-07-06', activatedAt: '2026-07-29' },
  payments: [
    { dateTime: '2026-07-13T15:27:44', amount: 820000, method: 'uzcard' },
    { dateTime: '2026-07-13T15:26:56', amount: 20000, method: 'cash' },
  ],
};

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const studentsSnap = await getDocs(collection(db, 'students'));
  const byName = new Map();
  let maxPublicId = 0;
  studentsSnap.forEach((d) => {
    byName.set(d.data().fullName, { id: d.id, ...d.data() });
    if (d.data().publicId > maxPublicId) maxPublicId = d.data().publicId;
  });

  const enrollmentsSnap = await getDocs(query(collection(db, 'enrollments'), where('isArchived', '==', false), where('status', '==', 'active')));
  const enrollByStudentId = new Map();
  enrollmentsSnap.forEach((d) => enrollByStudentId.set(d.data().studentId, { id: d.id, ...d.data() }));

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('isArchived', '==', false)));
  const groupByCode = new Map();
  groupsSnap.forEach((d) => groupByCode.set(d.data().code, { id: d.id, ...d.data() }));

  const batch = writeBatch(db);

  // Shahlo Sayfuddinova — пропущена в Phase 1, добавляем как новую.
  {
    const g = groupByCode.get(SHAHLO.enrollment.groupCode);
    if (!g) throw new Error(`Группа не найдена: ${SHAHLO.enrollment.groupCode}`);
    const studentRef = doc(collection(db, 'students'));
    batch.set(studentRef, {
      id: studentRef.id,
      branchId: 'icon-main',
      publicId: maxPublicId + 1,
      fullName: SHAHLO.name,
      phone: phoneToDigits(SHAHLO.phone),
      phone2: null,
      birthDate: null,
      gender: null,
      photoUrl: null,
      status: 'active',
      statusReason: null,
      source: null,
      balance: SHAHLO.balance,
      balanceUpdatedAt: serverTimestamp(),
      note: '',
      isFlagged: false,
      activeGroupsCount: 1,
      firstPaymentAt: tsDt(SHAHLO.payments[SHAHLO.payments.length - 1].dateTime),
      lastPaymentAt: tsDt(SHAHLO.payments[0].dateTime),
      trialAt: null,
      leftAt: null,
      createdAt: ts(SHAHLO.accountAddedAt),
      createdBy: uid,
      isArchived: false,
    });
    const enrollRef = doc(collection(db, 'enrollments'));
    batch.set(enrollRef, {
      id: enrollRef.id,
      branchId: 'icon-main',
      studentId: studentRef.id,
      studentName: SHAHLO.name,
      groupId: g.id,
      groupCode: g.code,
      courseName: g.courseName,
      teacherId: g.teacherId,
      teacherName: g.teacherName,
      status: 'active',
      statusLabel: 'Активен (Оплачивает обучение)',
      price: SHAHLO.enrollment.price,
      discountPercent: 0,
      discountReason: '',
      addedAt: ts(SHAHLO.enrollment.addedAt),
      activatedAt: ts(SHAHLO.enrollment.activatedAt),
      pausedFrom: null,
      pausedTo: null,
      leftAt: null,
      leftReason: null,
      lastChargedMonth: null,
      isArchived: false,
      createdBy: uid,
      createdAt: ts(SHAHLO.enrollment.addedAt),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    for (const p of SHAHLO.payments) {
      const txRef = doc(collection(db, 'transactions'));
      batch.set(txRef, {
        id: txRef.id,
        branchId: 'icon-main',
        studentId: studentRef.id,
        studentName: SHAHLO.name,
        enrollmentId: enrollRef.id,
        groupId: g.id,
        groupCode: g.code,
        teacherId: g.teacherId,
        teacherName: g.teacherName,
        type: 'payment',
        amount: p.amount,
        method: p.method,
        date: ts(p.dateTime.slice(0, 10)),
        month: p.dateTime.slice(0, 7),
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
    }
    batch.update(doc(db, 'groups', g.id), { studentsCount: increment(1) });
    console.log('ADDED:', SHAHLO.name, `(group ${g.code}, ${SHAHLO.payments.length} платежа)`);
  }
  for (const n of NAMES) {
    const s = byName.get(n);
    if (!s) throw new Error(`Не найден: ${n}`);
    batch.update(doc(db, 'students', s.id), {
      status: 'archived',
      isArchived: true,
      statusReason: 'Удалён в modme (не найден ни по имени, ни по телефону) — архивирован для соответствия',
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    const enroll = enrollByStudentId.get(s.id);
    if (enroll) {
      batch.update(doc(db, 'enrollments', enroll.id), {
        status: 'archived',
        isArchived: true,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'groups', enroll.groupId), { studentsCount: increment(-1) });
    }
    console.log('ARCHIVED:', n, enroll ? `(было в группе ${enroll.groupCode})` : '(без активного enrollment)');
  }
  await batch.commit();
  console.log(`Готово. Архивировано: ${NAMES.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
