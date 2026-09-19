/**
 * Слияние R99 в R7 (обе: MS KRISTINA, нечётные дни, 18:30) перед переименованием
 * групп по правилу — по правилу обе получают код RTK18. Переносит не ушедших
 * учеников R99 → R7 (как merge-groups-into-duplicates.mjs), затем архивирует пустую
 * R99 так же, как кнопка «Архивировать» на странице группы.
 *
 *   node --env-file=.env scripts/merge-r99-into-r7.mjs           # dry-run
 *   node --env-file=.env scripts/merge-r99-into-r7.mjs --apply   # реально пишет
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, increment, Timestamp, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const PAIRS = [{ from: 'R99', to: 'R7' }];

const APPLY = process.argv.includes('--apply');

async function findGroupByCode(db, code) {
  const snap = await getDocs(query(collection(db, 'groups'), where('code', '==', code)));
  if (snap.empty) throw new Error(`Группа с кодом "${code}" не найдена`);
  if (snap.size > 1) throw new Error(`Больше одной группы с кодом "${code}" — разберись вручную`);
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Нужны SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD в .env');
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  console.log(APPLY ? 'Режим: ПРИМЕНЯЮ изменения' : 'Режим: dry-run (ничего не пишу, добавь --apply)');
  console.log('');

  for (const { from, to } of PAIRS) {
    const oldGroup = await findGroupByCode(db, from);
    const newGroup = await findGroupByCode(db, to);

    if (oldGroup.price !== newGroup.price) {
      console.warn(`! ${from} (${oldGroup.price}) и ${to} (${newGroup.price}) — разная цена, проверь вручную. Пропускаю пару.`);
      continue;
    }

    const enrollSnap = await getDocs(
      query(collection(db, 'enrollments'), where('groupId', '==', oldGroup.id), where('status', 'in', ['trial', 'active', 'paused'])),
    );

    console.log(`${from} -> ${to}: ${enrollSnap.size} учеников(а) к переносу`);
    enrollSnap.docs.forEach((d) => {
      const e = d.data();
      console.log(`  - ${e.studentName} (enrollment ${d.id}, status ${e.status})`);
    });

    if (!APPLY || enrollSnap.empty) continue;

    const batch = writeBatch(db);
    const now = Timestamp.now();
    enrollSnap.docs.forEach((d) => {
      batch.update(d.ref, {
        groupId: newGroup.id,
        groupCode: newGroup.code,
        courseName: newGroup.courseName ?? d.data().courseName,
        teacherId: newGroup.teacherId,
        teacherName: newGroup.teacherName,
        mergedFromGroupCode: from,
        mergedAt: now,
        updatedAt: now,
      });
    });
    batch.update(doc(db, 'groups', oldGroup.id), { studentsCount: increment(-enrollSnap.size) });
    batch.update(doc(db, 'groups', newGroup.id), { studentsCount: increment(enrollSnap.size) });
    await batch.commit();
    console.log(`  готово, перенесено ${enrollSnap.size}`);

    // Архивация пустой группы — те же поля, что у кнопки «Архивировать» (GroupDetailPage).
    const archive = writeBatch(db);
    archive.update(doc(db, 'groups', oldGroup.id), {
      isArchived: true,
      status: 'archived',
      archivedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid,
    });
    if (oldGroup.teacherId) archive.update(doc(db, 'teachers', oldGroup.teacherId), { groupsCount: increment(-1) });
    await archive.commit();
    console.log(`  ${from} архивирована`);
    console.log('');
  }

  console.log('Всё.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
