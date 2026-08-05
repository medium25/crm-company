/**
 * Одноразовая миграция: even/odd расписание группы больше не календарная
 * чётность числа месяца, а недельный паттерн (нечётные = пн/ср/пт, чётные =
 * вт/чт/сб — см. matchesSchedule в src/lib/schedule.js).
 *
 * Уже созданные уроки на старых (календарных) датах сами не пересоздаются —
 * generateLessons идемпотентен по ID и только добавляет недостающее.
 * Скрипт по каждой активной even/odd группе:
 *   1. находит будущие неотмеченные уроки (status: 'planned', дата >= сегодня),
 *      не совпадающие с новым паттерном, и удаляет их;
 *   2. вызывает generateLessons(), который догенерирует верные даты.
 * Проведённые (`held`) и прошедшие уроки не трогает — как и обычное
 * редактирование расписания («03 · Бизнес-логика» §2).
 *
 *   node --env-file=.env scripts/migrate-schedule-weekdays.js
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, writeBatch, Timestamp } from 'firebase/firestore';
import { matchesSchedule, generateLessons } from '../src/lib/schedule.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Нужны SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD в .env');
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('isArchived', '==', false)));
  const groups = groupsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((g) => g.schedule?.type === 'even' || g.schedule?.type === 'odd');

  console.log(`Групп even/odd (не в архиве): ${groups.length}`);

  let totalDeleted = 0;
  let totalCreated = 0;

  for (const group of groups) {
    const lessonsSnap = await getDocs(
      query(collection(db, 'lessons'), where('groupId', '==', group.id), where('status', '==', 'planned')),
    );

    const toDelete = lessonsSnap.docs.filter((d) => {
      const lessonDate = d.data().date;
      if (!(lessonDate instanceof Timestamp) || lessonDate.toMillis() < todayMs) return false;
      return !matchesSchedule(lessonDate.toDate(), group.schedule);
    });

    if (toDelete.length > 0) {
      for (let i = 0; i < toDelete.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of toDelete.slice(i, i + 400)) batch.delete(d.ref);
        // eslint-disable-next-line no-await-in-loop -- батчи по 400 обязаны идти последовательно
        await batch.commit();
      }
      totalDeleted += toDelete.length;
      console.log(`${group.code}: удалено ${toDelete.length} будущих уроков на старых датах`);
    }

    const { created } = await generateLessons(db, {
      ...group,
      startDate: group.startDate.toDate(),
      endDate: group.endDate.toDate(),
    });
    totalCreated += created;
    if (created > 0) {
      console.log(`${group.code}: догенерировано ${created} уроков по новому паттерну`);
    }
  }

  console.log(`Готово. Удалено: ${totalDeleted}, создано: ${totalCreated}, групп обработано: ${groups.length}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
