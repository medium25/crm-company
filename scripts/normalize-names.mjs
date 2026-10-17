/**
 * Приводит порядок «имя фамилия» у уже заведённых людей по правилу: слова, оканчивающиеся на
 * -ov / -ev / -ova / -eva, считаются фамилией и ставятся последними.
 *
 *   node --env-file=.env scripts/normalize-names.mjs           # dry-run, только печатает
 *   node --env-file=.env scripts/normalize-names.mjs --apply   # пишет + копия оригиналов в BACKUP_PATH
 *
 * Трогает students, staff, teachers (fullName), evaluationStaff и копии studentName в enrollments
 * изменённых студентов. transactions не трогает: правила Firestore не разрешают менять в них studentName.
 */
import { writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, writeBatch, doc, serverTimestamp } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const BACKUP_PATH = process.env.BACKUP_PATH || 'names-backup.json';
const SURNAME_RE = /(ov|ev|ova|eva)$/i;

const app = initializeApp({
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
});
await signInWithEmailAndPassword(getAuth(app), process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
const db = getFirestore(app);

/** @returns {{fullName: string, firstName: string, lastName: string, flag?: string}|null} null — менять нечего */
function normalize(fullName) {
  const tokens = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  const surnames = tokens.filter((t) => SURNAME_RE.test(t));
  const given = tokens.filter((t) => !SURNAME_RE.test(t));
  if (surnames.length === 0 || given.length === 0) return null;
  const next = [...given, ...surnames];
  if (next.join(' ') === tokens.join(' ')) return null;
  const flag = surnames.length > 1 ? 'несколько слов на -ov/-ev' : given.length > 1 ? 'несколько слов без -ov/-ev' : undefined;
  return { fullName: next.join(' '), firstName: given.join(' '), lastName: surnames.join(' '), flag };
}

const backup = {};
const changes = [];
for (const col of ['students', 'staff', 'teachers', 'evaluationStaff']) {
  const snap = await getDocs(collection(db, col));
  for (const d of snap.docs) {
    const r = normalize(d.data().fullName);
    if (!r) continue;
    changes.push({ col, id: d.id, before: d.data().fullName, ...r });
    (backup[col] ??= {})[d.id] = { fullName: d.data().fullName, firstName: d.data().firstName ?? null, lastName: d.data().lastName ?? null };
  }
}

for (const c of changes) console.log(`${c.col.padEnd(15)} "${c.before}" -> "${c.fullName}"${c.flag ? `   [!] ${c.flag}` : ''}`);
console.log(`\nИзменений: ${changes.length} (students ${changes.filter((c) => c.col === 'students').length}, staff ${changes.filter((c) => c.col === 'staff').length}, teachers ${changes.filter((c) => c.col === 'teachers').length}, evaluationStaff ${changes.filter((c) => c.col === 'evaluationStaff').length}). Помечены [!]: ${changes.filter((c) => c.flag).length}`);

if (!APPLY) {
  console.log('dry-run: ничего не записано. Для записи — флаг --apply.');
  process.exit(0);
}

writeFileSync(BACKUP_PATH, JSON.stringify(backup, null, 2));
console.log(`Копия оригиналов: ${BACKUP_PATH}`);

let batch = writeBatch(db);
let n = 0;
const flush = async () => { if (n) { await batch.commit(); batch = writeBatch(db); n = 0; } };
const put = async (ref, data) => { batch.update(ref, data); if (++n >= 400) await flush(); };

for (const c of changes) {
  await put(doc(db, c.col, c.id), { fullName: c.fullName, firstName: c.firstName, lastName: c.lastName, updatedAt: serverTimestamp() });
  if (c.col === 'students') {
    const enr = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', c.id)));
    for (const e of enr.docs) await put(e.ref, { studentName: c.fullName });
  }
}
await flush();
console.log('Готово.');
process.exit(0);
