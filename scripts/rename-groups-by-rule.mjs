/**
 * Переименование групп по правилу кода (см. src/lib/groupCode.js): язык + чётность
 * + первая буква имени учителя + час начала. Архивные группы не трогаем.
 * Вместе с groups.code обновляет денормализованные копии: enrollments.groupCode
 * и enrollments.transferredFromGroupCode. Транзакции и уроки — историческое, не трогаем.
 *
 *   node --env-file=.env scripts/rename-groups-by-rule.mjs           # dry-run (ничего не пишет)
 *   node --env-file=.env scripts/rename-groups-by-rule.mjs --apply   # реально пишет
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { groupCodeFor } from '../src/lib/groupCode.js';

const APPLY = process.argv.includes('--apply');
// Ручные исходы для групп, у которых по правилу получился один и тот же код (old code → new code).
const OVERRIDES = JSON.parse(process.env.CODE_OVERRIDES ?? '{}');

const app = initializeApp({ apiKey: process.env.VITE_FB_API_KEY, authDomain: process.env.VITE_FB_AUTH_DOMAIN, projectId: process.env.VITE_FB_PROJECT_ID, appId: process.env.VITE_FB_APP_ID });
await signInWithEmailAndPassword(getAuth(app), process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const db = getFirestore(app);

const snap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', 'icon-main')));
const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => !g.isArchived);

const plan = groups.map((g) => {
  const auto = groupCodeFor({ courseName: g.courseName, scheduleType: g.schedule?.type, teacherName: g.teacherName, time: g.schedule?.time });
  return { id: g.id, old: g.code, next: OVERRIDES[g.code] ?? auto, auto, teacher: g.teacherName, time: g.schedule?.time, type: g.schedule?.type, status: g.status };
});

const problems = [];
for (const p of plan) if (!p.next) problems.push(`нет кода по правилу: ${p.old}`);
const byNew = new Map();
for (const p of plan) if (p.next) byNew.set(p.next, [...(byNew.get(p.next) ?? []), p.old]);
for (const [code, olds] of byNew) if (olds.length > 1) problems.push(`один код ${code} у групп: ${olds.join(', ')}`);

console.log('старый → новый');
for (const p of plan) console.log(`${p.old}\t→ ${p.next ?? '—'}\t${p.teacher} ${p.type} ${p.time} [${p.status}]`);
console.log(problems.length ? `\nПРОБЛЕМЫ:\n${problems.join('\n')}` : '\nПроблем нет');

if (!APPLY) process.exit(0);
if (problems.length) {
  console.error('\nНе применяю — сначала разберись с проблемами.');
  process.exit(1);
}

let writes = 0;
for (const p of plan) {
  if (p.old === p.next) continue;
  const [enrolls, transferred] = await Promise.all([
    getDocs(query(collection(db, 'enrollments'), where('groupId', '==', p.id))),
    getDocs(query(collection(db, 'enrollments'), where('transferredFromGroupId', '==', p.id))),
  ]);
  const ops = [
    [doc(db, 'groups', p.id), { code: p.next }],
    ...enrolls.docs.map((d) => [d.ref, { groupCode: p.next }]),
    ...transferred.docs.map((d) => [d.ref, { transferredFromGroupCode: p.next }]),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const [ref, data] of ops.slice(i, i + 400)) batch.update(ref, data);
    await batch.commit();
  }
  writes += ops.length;
  console.log(`✓ ${p.old} → ${p.next} (записей: ${ops.length})`);
}
console.log(`Готово, записано документов: ${writes}`);
process.exit(0);
