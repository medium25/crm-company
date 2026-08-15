/**
 * Бэкафилл: лиды, у которых funnelStage застрял в нетерминальной стадии
 * («Заявки»), хотя студент уже состоит (или состоял) в группе — enrollment
 * существует. Баг: AddToGroupModal никогда не трогал funnelStage —
 * добавление лида в группу напрямую (в обход «Пришёл» → оплата на доске)
 * оставляло карточку на «Заявках» навсегда. Форвардный фикс — в
 * AddToGroupModal.jsx (закрывает funnelStage при создании enrollment);
 * этот скрипт разово закрывает уже накопившиеся зависшие карточки.
 *
 *   node --env-file=.env scripts/backfill-stuck-leads-with-enrollment.mjs           # dry-run
 *   node --env-file=.env scripts/backfill-stuck-leads-with-enrollment.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { NON_TERMINAL_STAGES } from '../src/lib/leadFunnel.js';

const APPLY = process.argv.includes('--apply');

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

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('funnelStage', 'in', NON_TERMINAL_STAGES)));
  const stuckLeads = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Лидов с нетерминальным funnelStage: ${stuckLeads.length}`);

  const enrollmentsSnap = await getDocs(collection(db, 'enrollments'));
  const enrolledStudentIds = new Set(enrollmentsSnap.docs.map((d) => d.data().studentId));

  const toClose = stuckLeads.filter((s) => enrolledStudentIds.has(s.id));

  console.log(`\nИз них уже есть enrollment (зависли на доске «Заявки»): ${toClose.length}`);
  toClose.forEach((s) => console.log(`  ${s.fullName} (${s.id}) — funnelStage=${s.funnelStage}`));

  if (!APPLY) {
    console.log('\ndry-run. Проверь список и запусти с --apply.');
    process.exit(0);
  }

  for (const s of toClose) {
    // eslint-disable-next-line no-await-in-loop
    await updateDoc(doc(db, 'students', s.id), {
      funnelStage: 'won',
      stageHistory: [...(s.stageHistory ?? []), { stage: 'won', enteredAt: new Date() }],
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    console.log(`Закрыт: ${s.fullName}`);
  }
  console.log(`\nГотово. Закрыто: ${toClose.length}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
