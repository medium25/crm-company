/**
 * Импорт посещаемости за июль-август 2026 из старой системы (icon.modme.uz)
 * в новую CRM. Источник — вручную выгруженные grid-дампы 26 групп
 * (scratchpad/attendance_raw/*.json), сматченные со студентами новой системы
 * по groups.code + studentName (с фоллбэком на короткие имена в enrollments).
 *
 *   node --env-file=.env scripts/import-old-attendance-jul-aug.mjs           # dry-run
 *   node --env-file=.env scripts/import-old-attendance-jul-aug.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';

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

const SCRATCH = '/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/703b965b-104f-462d-bf73-66dadc8f2332/scratchpad';
const matched = JSON.parse(readFileSync(`${SCRATCH}/attendance_matched.json`, 'utf8'));
console.log(`Записей к импорту: ${matched.length}`);

if (!APPLY) {
  console.log('Пример (первые 5):', matched.slice(0, 5));
  process.exit(0);
}

const heldLessons = new Set();
let batch = writeBatch(db);
let opsInBatch = 0;
let batchesCommitted = 0;

async function flush() {
  if (opsInBatch === 0) return;
  await batch.commit();
  batchesCommitted += 1;
  batch = writeBatch(db);
  opsInBatch = 0;
}

for (const r of matched) {
  const attRef = doc(db, 'lessons', r.lessonId, 'attendance', r.studentId);
  batch.set(attRef, {
    studentName: r.studentName,
    status: r.status,
    comment: '',
    groupId: r.groupIdNew,
    month: r.month,
    markedBy: user.uid,
    markedAt: serverTimestamp(),
  });
  opsInBatch += 1;

  if (!heldLessons.has(r.lessonId)) {
    heldLessons.add(r.lessonId);
    const lessonRef = doc(db, 'lessons', r.lessonId);
    batch.update(lessonRef, { status: 'held', markedBy: user.uid, markedAt: serverTimestamp() });
    opsInBatch += 1;
  }

  if (opsInBatch >= 450) await flush();
}
await flush();

console.log(`Готово. Батчей: ${batchesCommitted}. Уроков помечено held: ${heldLessons.size}. Записей посещаемости: ${matched.length}.`);
process.exit(0);
