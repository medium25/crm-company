/**
 * 16 студентов, пропущенных в Phase 1 миграции — на момент снимка modme были
 * Frozen/Trial, а Phase 1 брал только "Active (Learns)". Обнаружено сверкой
 * ростера каждой из 28 групп с базой (см. scripts/_activation_dates_progress.md
 * и переписку). Данные (телефон/баланс) — со страницы /students, фильтр
 * Status=Frozen в modme (скриншот от пользователя) + один профиль (Trial).
 * 17-й кандидат (Abror, R13, Trial) исключён — пользователь подтвердил,
 * что его больше нет в modme вообще (не дошёл до реального зачисления).
 *
 * Транзакций/истории платежей нет — только текущий баланс снимком, как и
 * в исходной Phase 1 миграции для случаев без полной истории.
 *
 *   node --env-file=.env scripts/_migrate_missing_frozen_trial.mjs
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

const BRANCH_ID = 'icon-main';

function ts(dateStr) {
  return Timestamp.fromDate(new Date(`${dateStr}T00:00:00+05:00`));
}
function phoneToDigits(raw) {
  return '998' + raw.replace(/\D/g, '');
}

// { name, phone, birthDate|null, groupCode, date (addedAt=activatedAt), balance, trial(bool) }
const STUDENTS = [
  { name: 'Jasmina Tojiyeva', phone: '97 636 55 07', birthDate: null, groupCode: 'I13', date: '2026-06-16', balance: 74000 },
  { name: 'Asliddin Oybekov', phone: '77 550 11 99', birthDate: null, groupCode: 'R41', date: '2026-06-13', balance: 490000 },
  { name: 'Muhammadsolih', phone: '90 069 12 21', birthDate: null, groupCode: 'R14', date: '2026-06-11', balance: 420000 },
  { name: 'Uchqunbek Bomurodov', phone: '50 666 60 67', birthDate: null, groupCode: 'R34', date: '2026-06-10', balance: 274615 },
  { name: 'Sevinch Muxammadiyeva', phone: '97 884 65 67', birthDate: null, groupCode: 'R39', date: '2026-06-26', balance: 280000 },
  { name: 'Robiya Saidganiyeva', phone: '50 889 53 63', birthDate: null, groupCode: 'R32', date: '2026-07-13', balance: 350000 },
  { name: 'Mohir Ergashboyev', phone: '93 005 47 69', birthDate: null, groupCode: 'I5', date: '2026-05-01', balance: 410769 },
  { name: "Saida`zim Qudratrov", phone: '99 955 30 55', birthDate: null, groupCode: 'I13', date: '2026-05-14', balance: 519500 },
  { name: 'Abduqodir Toirov', phone: '99 006 95 16', birthDate: null, groupCode: 'R42', date: '2026-04-09', balance: 350000 },
  { name: 'Shahruz Sharifov', phone: '99 118 31 49', birthDate: '2005-12-14', groupCode: 'R42', date: '2026-04-02', balance: 310769 },
  { name: 'Zuhriddin Jamoliddinov', phone: '94 610 88 89', birthDate: '1989-11-28', groupCode: 'R4', date: '2026-02-10', balance: 775384 },
  { name: "Sevara Sho'ldasova", phone: '94 530 11 03', birthDate: null, groupCode: 'R6', date: '2026-02-06', balance: 630000 },
  { name: 'Dinora Turdimurodova', phone: '90 812 07 75', birthDate: null, groupCode: 'R4', date: '2026-01-21', balance: 0 },
  { name: 'Safar Nishonaliyev', phone: '97 882 20 30', birthDate: null, groupCode: 'R42', date: '2026-01-10', balance: 140000 },
  { name: 'Vasila Abdugaffarova', phone: '90 932 83 83', birthDate: null, groupCode: 'R13', date: '2025-12-02', balance: 370000 },
  { name: 'Muhammadsolix Abdurashidov', phone: '88 125 06 25', birthDate: null, groupCode: 'R33', date: '2026-07-13', balance: 700000, trial: true },
];

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('isArchived', '==', false)));
  const groupByCode = new Map();
  groupsSnap.forEach((d) => groupByCode.set(d.data().code, { id: d.id, ...d.data() }));

  const studentsSnap = await getDocs(collection(db, 'students'));
  let maxPublicId = 0;
  const existingNames = new Set();
  studentsSnap.forEach((d) => {
    existingNames.add(d.data().fullName);
    if (d.data().publicId > maxPublicId && d.data().publicId < 2000000) maxPublicId = d.data().publicId;
  });

  let nextPublicId = maxPublicId + 1;
  const batch = writeBatch(db);
  const groupIncrements = new Map();
  const report = [];

  for (const s of STUDENTS) {
    if (existingNames.has(s.name)) { report.push(`ПРОПУЩЕН (уже есть в базе): ${s.name}`); continue; }
    const g = groupByCode.get(s.groupCode);
    if (!g) { report.push(`ГРУППА НЕ НАЙДЕНА ${s.groupCode}: ${s.name}`); continue; }

    const dateTs = ts(s.date);
    const isTrial = !!s.trial;

    const studentRef = doc(collection(db, 'students'));
    batch.set(studentRef, {
      id: studentRef.id,
      branchId: BRANCH_ID,
      publicId: nextPublicId++,
      fullName: s.name,
      phone: phoneToDigits(s.phone),
      phone2: null,
      birthDate: s.birthDate ? ts(s.birthDate) : null,
      gender: null,
      photoUrl: null,
      status: isTrial ? 'trial' : 'paused',
      statusReason: isTrial ? null : 'Frozen (заморожен) в modme — довнесён вручную, пропущен в Phase 1 миграции',
      source: null,
      balance: s.balance,
      balanceUpdatedAt: serverTimestamp(),
      note: 'Перенесено вручную 2026-08-03 (пропущен в исходной миграции — Phase 1 брал только Active). История платежей не перенесена, только текущий баланс-снимок.',
      isFlagged: false,
      activeGroupsCount: 1,
      firstPaymentAt: null,
      lastPaymentAt: null,
      trialAt: isTrial ? dateTs : null,
      leftAt: null,
      createdAt: dateTs,
      createdBy: uid,
      isArchived: false,
    });

    const enrollRef = doc(collection(db, 'enrollments'));
    batch.set(enrollRef, {
      id: enrollRef.id,
      branchId: BRANCH_ID,
      studentId: studentRef.id,
      studentName: s.name,
      groupId: g.id,
      groupCode: g.code,
      courseName: g.courseName,
      teacherId: g.teacherId,
      teacherName: g.teacherName,
      status: isTrial ? 'trial' : 'paused',
      statusLabel: isTrial ? 'Пробный урок' : 'Заморожен',
      price: g.price,
      discountPercent: 0,
      discountReason: '',
      addedAt: dateTs,
      activatedAt: isTrial ? null : dateTs,
      pausedFrom: null,
      pausedTo: null,
      leftAt: null,
      leftReason: null,
      lastChargedMonth: null,
      isArchived: false,
      createdBy: uid,
      createdAt: dateTs,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });

    groupIncrements.set(g.id, (groupIncrements.get(g.id) ?? 0) + 1);
    report.push(`OK: ${s.name} -> ${s.groupCode}, publicId=${nextPublicId - 1}`);
  }

  for (const [groupId, inc] of groupIncrements) {
    batch.update(doc(db, 'groups', groupId), { studentsCount: increment(inc) });
  }

  console.log(report.join('\n'));
  console.log(`\nК созданию: ${groupIncrements.size ? [...groupIncrements.values()].reduce((a, b) => a + b, 0) : 0} студентов.`);

  await batch.commit();
  console.log('Готово. Записано в базу.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
