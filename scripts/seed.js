/**
 * Сид справочников из скриншотов референсной системы. Запускается вручную:
 *
 *   node --env-file=.env scripts/seed.js
 *
 * Нужны переменные окружения (кроме VITE_FB_* из .env):
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD — существующий пользователь Firebase Auth,
 *   станет CEO (staff.role = 'ceo'), если ещё не заведён в staff.
 *
 * План Spark — Cloud Functions не используем, пишем клиентским SDK от имени
 * этого пользователя. Firestore Rules на момент сидирования должны разрешать
 * ему запись (до деплоя боевых правил в фазе 8 обычно открыт test mode).
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const BRANCH_ID = 'icon-main';

const COURSES = [
  { id: 'ingliz-tili', name: 'INGLIZ TILI', defaultPrice: 890000, defaultDurationMonths: 12, color: '#22406B' },
  { id: 'rus-tili', name: 'RUS TILI', defaultPrice: 840000, defaultDurationMonths: 12, color: '#E5842B' },
];

const ROOMS = [
  { id: 'room-4', name: '4', capacity: 12 },
  { id: 'room-6', name: '6', capacity: 12 },
];

// Телефоны и число групп — со скриншота 2 («Учителя»).
const TEACHERS = [
  { id: 't_sanjar', displayName: 'MR SANJAR', fullName: 'Sanjar', phone: '998904020021', groupsCount: 6 },
  { id: 't_shaxzoda', displayName: 'MS SHAXZODA', fullName: 'Shaxzoda', phone: '998887126202', groupsCount: 8 },
  { id: 't_kamilla', displayName: 'MS KAMILLA', fullName: 'Kamilla', phone: '998959773231', groupsCount: 0 },
  { id: 't_ziyoda', displayName: 'MS ZIYODA (BETA)', fullName: 'Ziyoda', phone: '998930726604', groupsCount: 4 },
  { id: 't_kristina', displayName: 'MS KRISTINA', fullName: 'Kristina', phone: '998943302801', groupsCount: 11 },
];

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Задай SEED_ADMIN_EMAIL и SEED_ADMIN_PASSWORD перед запуском сида.');
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  const batch = writeBatch(db);
  const stamp = { createdAt: serverTimestamp(), createdBy: user.uid, updatedAt: serverTimestamp(), updatedBy: user.uid };

  batch.set(doc(db, 'staff', user.uid), {
    fullName: 'CEO',
    phone: '',
    email: SEED_ADMIN_EMAIL,
    role: 'ceo',
    branchIds: [BRANCH_ID],
    teacherId: null,
    isActive: true,
    ...stamp,
  }, { merge: true });

  batch.set(doc(db, 'branches', BRANCH_ID), {
    name: 'ICON Education',
    address: 'Ташкент',
    phone: '998712000000',
    timezone: 'Asia/Tashkent',
    currency: 'UZS',
    lessonsPerMonth: 14,
    isArchived: false,
    ...stamp,
  }, { merge: true });

  for (const course of COURSES) {
    batch.set(doc(db, 'courses', course.id), { ...course, isArchived: false, ...stamp }, { merge: true });
  }

  for (const room of ROOMS) {
    batch.set(doc(db, 'rooms', room.id), { ...room, branchId: BRANCH_ID, isArchived: false, ...stamp }, { merge: true });
  }

  for (const teacher of TEACHERS) {
    batch.set(doc(db, 'teachers', teacher.id), {
      ...teacher,
      branchId: BRANCH_ID,
      branchIds: [BRANCH_ID],
      staffUid: null,
      isActive: true,
      isArchived: false,
      ...stamp,
    }, { merge: true });
  }

  await batch.commit();
  console.log('Сид готов: 1 филиал, 2 курса, 2 кабинета, 5 учителей, staff-документ владельца.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
