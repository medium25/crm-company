// scripts/backfill-funnel-stage.mjs
// Одноразовый бэкфилл funnelStage/assignedOperator для лидов, заведённых
// до 2026-08-13-leads-funnel-redesign.md.
//
//   node --env-file=.env scripts/backfill-funnel-stage.mjs           # dry-run
//   node --env-file=.env scripts/backfill-funnel-stage.mjs --apply
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID, storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID, appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

function mapStage(student) {
  if (student.status === 'trial') return 'trial_scheduled';
  const hasAttempts = Array.isArray(student.callAttempts) && student.callAttempts.length > 0;
  return hasAttempts ? 'calling' : 'new';
}

async function main() {
  const snap = await getDocs(
    query(collection(db, 'students'), where('isArchived', '==', false), where('status', 'in', ['lead', 'trial'])),
  );
  console.log(`Найдено ${snap.size} лидов/пробных без funnelStage-миграции.`);

  let planned = 0;
  const batchSize = 400;
  let batch = writeBatch(db);
  let inBatch = 0;

  for (const docSnap of snap.docs) {
    const student = docSnap.data();
    if (student.funnelStage) continue; // уже мигрирован — повторный прогон безопасен
    const funnelStage = mapStage(student);
    const assignedOperator = student.assignedOperator ?? student.createdBy ?? null;
    planned += 1;
    console.log(`${student.fullName} (${docSnap.id}): status=${student.status} → funnelStage=${funnelStage}, assignedOperator=${assignedOperator}`);
    if (APPLY) {
      batch.update(doc(db, 'students', docSnap.id), {
        funnelStage,
        assignedOperator,
        stageHistory: [{ stage: funnelStage, enteredAt: new Date() }],
        rescheduleCount: student.rescheduleCount ?? 0,
        closingTouchNumber: student.closingTouchNumber ?? 0,
      });
      inBatch += 1;
      if (inBatch >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        inBatch = 0;
      }
    }
  }
  if (APPLY && inBatch > 0) await batch.commit();

  console.log(APPLY ? `Применено: ${planned} документов.` : `Dry-run: ${planned} документов будут изменены. Запустите с --apply, чтобы закоммитить.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => process.exit(0));
