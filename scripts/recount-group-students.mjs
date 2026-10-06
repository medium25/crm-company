/**
 * Пересчёт groups.studentsCount по фактическим записям. Счётчик денормализован и «плывёт»
 * (часть сценариев не двигает его), а «Расписание кабинетов» на дашборде показывает именно его.
 * Правило то же, что в списке группы (GroupDetailPage): запись active/trial/paused, не в архиве,
 * студент не в архиве; один студент считается один раз. Enrollments и студентов не трогаем —
 * меняется только счётчик у групп, старое значение печатается для отката.
 *
 *   node --env-file=.env scripts/recount-group-students.mjs           # dry-run
 *   node --env-file=.env scripts/recount-group-students.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const BRANCH = process.env.BRANCH_ID || 'icon-main';
const app = initializeApp({
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
});
const db = getFirestore(app);
const { user } = await signInWithEmailAndPassword(getAuth(app), process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const docs = async (c, ...w) => (await getDocs(query(collection(db, c), ...w))).docs.map((d) => ({ id: d.id, ...d.data() }));
const [groups, enrollments, archivedStudents] = await Promise.all([
  docs('groups', where('branchId', '==', BRANCH), where('isArchived', '==', false)),
  docs('enrollments', where('branchId', '==', BRANCH), where('isArchived', '==', false), where('status', 'in', ['active', 'trial', 'paused'])),
  docs('students', where('branchId', '==', BRANCH), where('isArchived', '==', true)),
]);
const archived = new Set(archivedStudents.map((s) => s.id));
const live = new Map();
for (const e of enrollments) {
  if (archived.has(e.studentId)) continue;
  if (!live.has(e.groupId)) live.set(e.groupId, new Set());
  live.get(e.groupId).add(e.studentId);
}

let changed = 0;
for (const g of groups.sort((a, b) => String(a.code).localeCompare(String(b.code)))) {
  const next = live.get(g.id)?.size ?? 0;
  if ((g.studentsCount ?? 0) === next) continue;
  changed += 1;
  console.log(`${g.code}: ${g.studentsCount ?? 0} -> ${next}`);
  if (APPLY) await updateDoc(doc(db, 'groups', g.id), { studentsCount: next, updatedAt: serverTimestamp(), updatedBy: user.uid });
}
console.log(`${APPLY ? 'Обновлено' : 'К обновлению (dry-run)'}: ${changed} из ${groups.length} групп`);
process.exit(0);
