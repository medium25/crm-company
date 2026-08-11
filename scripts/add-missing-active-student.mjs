/**
 * Mahliyo Xasanova (940288807) — активная студентка в старой системе
 * (группа R32, активирована 06.08.2026), в нашей базе отсутствует вообще
 * (не найдена ни по одному телефону). Разовое добавление, аналогично
 * Abror из backfill-trial-enrollments.mjs.
 *
 *   node --env-file=.env scripts/add-missing-active-student.mjs           # dry-run
 *   node --env-file=.env scripts/add-missing-active-student.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, addDoc, updateDoc, doc, increment, Timestamp, serverTimestamp } from 'firebase/firestore';

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

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', BRANCH_ID), where('code', '==', 'R32')));
  if (groupsSnap.empty) {
    console.log('СТОП: группа R32 не найдена');
    process.exit(1);
  }
  const group = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() };
  console.log('Группа R32:', group.id, group.courseName, group.teacherName, 'price=' + group.price);
  console.log('Создать: Mahliyo Xasanova 998940288807, status=active, activatedAt=2026-08-06, price=840000');

  if (!APPLY) {
    console.log('\ndry-run. Запусти с --apply.');
    process.exit(0);
  }

  const activatedAtTs = Timestamp.fromDate(new Date('2026-08-06T00:00:00'));
  const studentRef = await addDoc(collection(db, 'students'), {
    fullName: 'Mahliyo Xasanova',
    phone: '998940288807',
    phone2: null,
    source: null,
    branchId: BRANCH_ID,
    publicId: Math.floor(1000000 + Math.random() * 9000000),
    birthDate: null,
    gender: null,
    photoUrl: null,
    status: 'active',
    statusReason: null,
    leadStage: null,
    leadResult: null,
    balance: 0,
    balanceUpdatedAt: serverTimestamp(),
    note: '',
    isFlagged: false,
    activeGroupsCount: 1,
    firstPaymentAt: null,
    lastPaymentAt: null,
    trialAt: null,
    leftAt: null,
    createdAt: Timestamp.fromDate(new Date('2026-08-04T19:00:00')),
    createdBy: user.uid,
    isArchived: false,
  });

  await addDoc(collection(db, 'enrollments'), {
    branchId: BRANCH_ID,
    studentId: studentRef.id,
    studentName: 'Mahliyo Xasanova',
    groupId: group.id,
    groupCode: group.code,
    courseName: group.courseName,
    teacherId: group.teacherId,
    teacherName: group.teacherName,
    status: 'active',
    statusLabel: 'Активен (Оплачивает обучение)',
    price: 840000,
    discountPercent: 0,
    discountReason: '',
    addedAt: Timestamp.fromDate(new Date('2026-08-04T19:00:00')),
    activatedAt: activatedAtTs,
    pausedFrom: null,
    pausedTo: null,
    leftAt: null,
    leftReason: null,
    lastChargedMonth: null,
    isArchived: false,
    createdAt: Timestamp.fromDate(new Date('2026-08-04T19:00:00')),
    createdBy: user.uid,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });

  await updateDoc(doc(db, 'groups', group.id), { studentsCount: increment(1) });
  console.log('Готово: Mahliyo Xasanova создана, зачислена в R32.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
