/**
 * Перенос активных студентов + активных групп из modme (Phase 1).
 * Данные вычитаны вручную из icon.modme.uz 25.07.2026 — см. _migrate_phase1_data.mjs
 *
 *   node --env-file=.env scripts/_migrate_phase1.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { GROUPS, STUDENTS } from './_migrate_phase1_data.mjs';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const BRANCH_ID = 'icon-main';
const COURSE_PRICE = { 'ingliz-tili': 890000, 'rus-tili': 840000 };

function ts(dateStr) {
  return Timestamp.fromDate(new Date(`${dateStr}T00:00:00`));
}

function phoneToDigits(raw) {
  return '998' + raw.replace(/\D/g, '');
}

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) throw new Error('Задай SEED_ADMIN_EMAIL/PASSWORD');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  // 1. Снести старые dummy-данные (тестовые записи из фазы 0-7, не реальные
  // студенты). enrollments можно удалить (rules: allow delete if isAdmin()).
  // students/groups delete запрещён правилами намертво — архивируем вместо
  // удаления (тот же soft-delete путь, что использует само приложение).
  {
    const snap = await getDocs(collection(db, 'enrollments'));
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(doc(db, 'enrollments', d.id));
      n++;
      if (n % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    await batch.commit();
    console.log(`удалено enrollments: ${snap.size}`);
  }
  for (const col of ['groups', 'students']) {
    const snap = await getDocs(collection(db, col));
    let batch = writeBatch(db);
    let n = 0;
    for (const d of snap.docs) {
      const patch = { isArchived: true, updatedBy: uid, updatedAt: serverTimestamp() };
      if (col === 'groups') patch.status = 'archived';
      if (col === 'students') patch.status = 'archived';
      batch.update(doc(db, col, d.id), patch);
      n++;
      if (n % 400 === 0) {
        await batch.commit();
        batch = writeBatch(db);
      }
    }
    await batch.commit();
    console.log(`архивировано ${col}: ${snap.size}`);
  }

  // 2. room-5 — есть в modme, отсутствует у нас.
  {
    const batch = writeBatch(db);
    batch.set(doc(db, 'rooms', 'room-5'), {
      id: 'room-5',
      branchId: BRANCH_ID,
      name: '5',
      capacity: 12,
      isArchived: false,
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    console.log('room-5 создана');
  }

  // 3. Группы.
  const groupIdByCode = new Map();
  {
    const batch = writeBatch(db);
    let publicId = 900001;
    for (const g of GROUPS) {
      const ref = doc(collection(db, 'groups'));
      groupIdByCode.set(g.code, { id: ref.id, teacher: g.teacher, course: g.course });
      const studentsCount = STUDENTS.filter((s) => s.groups.includes(g.code)).length;
      batch.set(ref, {
        id: ref.id,
        branchId: BRANCH_ID,
        code: g.code,
        publicId: publicId++,
        courseId: g.course,
        courseName: g.course === 'ingliz-tili' ? 'INGLIZ TILI' : 'RUS TILI',
        teacherId: g.teacher,
        teacherName: TEACHER_DISPLAY[g.teacher],
        roomId: `room-${g.room}`,
        roomName: g.room,
        schedule: { type: g.days, time: g.time, weekdays: [], durationMin: 90 },
        startDate: ts(g.start),
        endDate: ts(g.end),
        price: COURSE_PRICE[g.course],
        lessonsPerMonth: 14,
        tags: [],
        status: 'active',
        studentsCount,
        isArchived: false,
        createdBy: uid,
        createdAt: serverTimestamp(),
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`групп создано: ${GROUPS.length}`);
  }

  // 4. Студенты + зачисления.
  const TEACHER_ID_BY_GROUP = new Map(GROUPS.map((g) => [g.code, g.teacher]));
  let publicId = 1000001;
  let enrollCount = 0;
  const CHUNK = 25; // ~25 студентов * (1 student + до 2 enrollments) держит батч < 400
  for (let i = 0; i < STUDENTS.length; i += CHUNK) {
    const chunk = STUDENTS.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const s of chunk) {
      const studentRef = doc(collection(db, 'students'));
      const firstGroup = groupIdByCode.get(s.groups[0]);
      batch.set(studentRef, {
        id: studentRef.id,
        branchId: BRANCH_ID,
        publicId: publicId++,
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
        activeGroupsCount: s.groups.length,
        firstPaymentAt: null,
        lastPaymentAt: null,
        trialAt: null,
        leftAt: null,
        createdAt: ts(s.start),
        createdBy: uid,
        isArchived: false,
      });

      for (const code of s.groups) {
        const g = groupIdByCode.get(code);
        const teacherId = TEACHER_ID_BY_GROUP.get(code);
        const enrollRef = doc(collection(db, 'enrollments'));
        batch.set(enrollRef, {
          id: enrollRef.id,
          branchId: BRANCH_ID,
          studentId: studentRef.id,
          studentName: s.name,
          groupId: g.id,
          groupCode: code,
          courseName: g.course === 'ingliz-tili' ? 'INGLIZ TILI' : 'RUS TILI',
          teacherId,
          teacherName: TEACHER_DISPLAY[teacherId],
          status: 'active',
          statusLabel: 'Активен (Оплачивает обучение)',
          price: COURSE_PRICE[g.course],
          discountPercent: 0,
          discountReason: '',
          addedAt: ts(s.start),
          activatedAt: ts(s.start),
          pausedFrom: null,
          pausedTo: null,
          leftAt: null,
          leftReason: null,
          lastChargedMonth: null,
          isArchived: false,
          createdBy: uid,
          createdAt: ts(s.start),
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        });
        enrollCount++;
      }
    }
    await batch.commit();
    console.log(`студенты ${i + 1}-${Math.min(i + CHUNK, STUDENTS.length)} записаны`);
  }
  console.log(`студентов создано: ${STUDENTS.length}, зачислений: ${enrollCount}`);

  // 5. groupsCount у учителей — по факту созданных групп.
  {
    const counts = new Map();
    for (const g of GROUPS) counts.set(g.teacher, (counts.get(g.teacher) ?? 0) + 1);
    const batch = writeBatch(db);
    for (const [teacherId, count] of counts) {
      batch.update(doc(db, 'teachers', teacherId), { groupsCount: count, updatedBy: uid, updatedAt: serverTimestamp() });
    }
    batch.update(doc(db, 'teachers', 't_kamilla'), { groupsCount: 0, updatedBy: uid, updatedAt: serverTimestamp() });
    await batch.commit();
    console.log('teachers.groupsCount обновлён');
  }

  console.log('Готово.');
  process.exit(0);
}

const TEACHER_DISPLAY = {
  t_sanjar: 'MR SANJAR',
  t_shaxzoda: 'MS SHAXZODA',
  t_ziyoda: 'MS ZIYODA (BETA)',
  t_kristina: 'MS KRISTINA',
  t_kamilla: 'MS KAMILLA',
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
