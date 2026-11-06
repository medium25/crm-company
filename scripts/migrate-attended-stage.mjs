/**
 * Стадии «Пробный проведён» и «Дожим» объединены в «Был на пробном» (funnelStage 'trial_completed'). Разбор карточек:
 *  - есть запись к учителю в группу или явка (attended) → остаются/переезжают из 'closing' в 'trial_completed';
 *  - иначе (на пробном не были) → «Отказ» с причиной no_show («Не пришёл на пробный»); архивные — archived_unpaid.
 *
 *   node --env-file=.env scripts/migrate-attended-stage.mjs          # dry-run
 *   node --env-file=.env scripts/migrate-attended-stage.mjs --apply  # пишет + копия в BACKUP_PATH
 */
import { writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const BACKUP_PATH = process.env.BACKUP_PATH || 'attended-stage-backup.json';
const app = initializeApp({
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  appId: process.env.VITE_FB_APP_ID,
});
await signInWithEmailAndPassword(getAuth(app), process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const db = getFirestore(app);

const snap = await getDocs(query(collection(db, 'students'), where('funnelStage', 'in', ['trial_completed', 'closing'])));
const enrSnap = await getDocs(query(collection(db, 'enrollments'), where('isArchived', '==', false)));
const withGroup = new Set(enrSnap.docs.filter((d) => d.data().teacherName && d.data().groupCode).map((d) => d.data().studentId));

const plan = snap.docs.map((d) => {
  const s = { id: d.id, ...d.data() };
  const attended = withGroup.has(s.id) || s.attended === true;
  const action = attended ? (s.funnelStage === 'closing' ? 'to_attended' : 'keep') : s.isArchived ? 'lost_archived' : 'lost_no_show';
  return { s, action };
});
for (const { s, action } of plan) console.log(`${action.padEnd(14)} ${s.fullName}  (${s.funnelStage}${s.isArchived ? ', архив' : ''})`);
const count = (a) => plan.filter((p) => p.action === a).length;
console.log(`\nОстаются: ${count('keep')}, из «Дожима» в «Был на пробном»: ${count('to_attended')}, в «Отказ» (не пришёл): ${count('lost_no_show')}, в «Отказ» (архив): ${count('lost_archived')}`);
if (!APPLY) {
  console.log('dry-run: ничего не записано. Для записи — флаг --apply.');
  process.exit(0);
}
writeFileSync(BACKUP_PATH, JSON.stringify(plan.map(({ s }) => ({ id: s.id, funnelStage: s.funnelStage, stageHistory: s.stageHistory ?? [], lostReason: s.lostReason ?? null, statusReason: s.statusReason ?? null })), null, 2));
const batch = writeBatch(db);
for (const { s, action } of plan) {
  if (action === 'keep') continue;
  const next = action === 'to_attended' ? 'trial_completed' : 'lost';
  batch.update(doc(db, 'students', s.id), {
    funnelStage: next,
    stageHistory: [...(s.stageHistory ?? []), { stage: next, enteredAt: new Date() }],
    ...(next === 'lost'
      ? {
          lostReason: action === 'lost_archived' ? 'archived_unpaid' : 'no_show',
          statusReason: action === 'lost_archived' ? 'Архивирован до оплаты' : 'Не пришёл на пробный',
          lostAt: serverTimestamp(),
        }
      : {}),
    updatedAt: serverTimestamp(),
  });
}
await batch.commit();
console.log(`Готово. Копия: ${BACKUP_PATH}`);
process.exit(0);
