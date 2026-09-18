/**
 * Одноразовый бэкфилл: merge-groups-into-duplicates.mjs (перенос R4/R5/R6 в
 * R31/R32/R33) писал свои поля mergedFromGroupCode/mergedAt — новый механизм
 * «серой» истории в AttendanceTab.jsx читает стандартные transferredFrom*
 * (те же, что пишет TransferGroupModal.jsx). Добавляет их этим enrollments,
 * не трогая mergedFromGroupCode/mergedAt (безвредные лишние поля).
 *
 *   node --env-file=.env scripts/backfill-transferred-from-fields.mjs           # dry-run
 *   node --env-file=.env scripts/backfill-transferred-from-fields.mjs --apply   # реально пишет
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const APPLY = process.argv.includes('--apply');

async function findGroupByCode(db, code) {
  const snap = await getDocs(query(collection(db, 'groups'), where('code', '==', code)));
  if (snap.empty) throw new Error(`Группа с кодом "${code}" не найдена`);
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) throw new Error('Нужны SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD в .env');

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  console.log(APPLY ? 'Режим: ПРИМЕНЯЮ изменения' : 'Режим: dry-run (ничего не пишу, добавь --apply)');

  const enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('mergedFromGroupCode', 'in', ['R4', 'R5', 'R6'])));
  console.log(`Найдено enrollments с mergedFromGroupCode: ${enrollSnap.size}`);

  const groupCache = new Map();
  const batch = writeBatch(db);
  let count = 0;
  for (const d of enrollSnap.docs) {
    const e = d.data();
    if (e.transferredFromGroupId) {
      console.log(`  - ${e.studentName}: уже есть transferredFromGroupId, пропуск`);
      continue;
    }
    if (!groupCache.has(e.mergedFromGroupCode)) {
      groupCache.set(e.mergedFromGroupCode, await findGroupByCode(db, e.mergedFromGroupCode));
    }
    const oldGroup = groupCache.get(e.mergedFromGroupCode);
    console.log(`  - ${e.studentName}: transferredFromGroupId=${oldGroup.id} (${e.mergedFromGroupCode}), transferredAt=${e.mergedAt?.toDate?.()}`);
    if (APPLY) {
      batch.update(d.ref, {
        transferredFromGroupId: oldGroup.id,
        transferredFromGroupCode: e.mergedFromGroupCode,
        transferredAt: e.mergedAt,
      });
      count++;
    }
  }

  if (APPLY && count > 0) {
    await batch.commit();
    console.log(`Записано: ${count}`);
  }

  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
