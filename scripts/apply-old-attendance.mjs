import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, collectionGroup, getDocs, doc, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { OLD_ATTENDANCE } from './old-attendance-aug-data.mjs';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const norm = (s) => (s || '').toLowerCase().replace(/['`ʻ’ʼ]/g, '').replace(/[^a-zа-я0-9]/gi, '');
const MONTH = '2026-08';

// Имя в старой системе (транскрипт) -> реальное имя в новой (сокращено/
// переставлены слова/опечатка при заведении) — по группам, где авто-
// сопоставление по норм. имени не сработало.
const NAME_ALIASES = {
  'I6:maryammirsaidova': 'maryam',
  'R12:amirbekraximov': 'rahimovamirbek',
  'R29:abdulloxabdullaxatov': 'abdullaxatovabdulloh',
  'R36:sherzodxidirov': 'sherzod',
  'R37:lobarsayidahmadova': 'lobar',
  'R5:jahongirvositov': 'jahongir',
  'R6:husanturdumuhammedov': 'husanturdumuhammadov',
};
const pad2 = (n) => String(n).padStart(2, '0');

let totalWritten = 0;
let totalSkippedExisting = 0;
let totalSkippedNoLesson = 0;
let totalSkippedNoStudent = 0;
const unmatchedStudents = [];
const missingLessons = [];

let batch = writeBatch(db);
let inBatch = 0;
async function commitIfNeeded(force = false) {
  if (inBatch >= 400 || (force && inBatch > 0)) {
    await batch.commit();
    batch = writeBatch(db);
    inBatch = 0;
  }
}

for (const [code, groupData] of Object.entries(OLD_ATTENDANCE)) {
  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('branchId', '==', 'icon-main'), where('code', '==', code)));
  if (groupsSnap.empty) {
    console.log(`ГРУППА НЕ НАЙДЕНА в новой системе: ${code}`);
    continue;
  }
  const groupDoc = groupsSnap.docs[0];
  const groupId = groupDoc.id;

  const enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('groupId', '==', groupId), where('isArchived', '==', false)));
  const studentIdByName = new Map();
  enrollSnap.forEach((d) => {
    const e = d.data();
    studentIdByName.set(norm(e.studentName), e.studentId);
  });

  const lessonsSnap = await getDocs(query(collection(db, 'lessons'), where('groupId', '==', groupId), where('month', '==', MONTH)));
  const lessonByDateKey = new Map();
  lessonsSnap.forEach((d) => lessonByDateKey.set(d.data().dateKey, { id: d.id, ...d.data() }));

  const attSnap = await getDocs(query(collectionGroup(db, 'attendance'), where('groupId', '==', groupId), where('month', '==', MONTH)));
  const existingKeys = new Set();
  attSnap.forEach((d) => existingKeys.add(`${d.ref.parent.parent.id}_${d.id}`));

  for (const [studentName, statuses] of Object.entries(groupData.students)) {
    const aliasKey = NAME_ALIASES[`${code}:${norm(studentName)}`];
    const studentId = studentIdByName.get(aliasKey ?? norm(studentName));
    if (!studentId) {
      unmatchedStudents.push(`${code}: ${studentName}`);
      totalSkippedNoStudent += statuses.filter(Boolean).length;
      continue;
    }
    groupData.days.forEach((day, i) => {
      const raw = statuses[i];
      if (!raw) return; // нет данных в старой системе — пропускаем
      const dateKey = `${MONTH}-${pad2(day)}`;
      const lesson = lessonByDateKey.get(dateKey);
      if (!lesson) {
        missingLessons.push(`${code} ${dateKey}`);
        totalSkippedNoLesson += 1;
        return;
      }
      const key = `${lesson.id}_${studentId}`;
      if (existingKeys.has(key)) {
        totalSkippedExisting += 1;
        return;
      }
      const status = raw === 'W' ? 'present' : 'absent';
      batch.set(doc(db, 'lessons', lesson.id, 'attendance', studentId), {
        studentName,
        status,
        comment: '',
        groupId,
        month: MONTH,
        markedBy: 'sync-old-system',
        markedAt: serverTimestamp(),
      });
      inBatch += 1;
      batch.update(doc(db, 'lessons', lesson.id), {
        status: 'held',
        markedBy: 'sync-old-system',
        markedAt: serverTimestamp(),
      });
      inBatch += 1;
      totalWritten += 1;
      existingKeys.add(key); // защита от повторной записи в рамках этого прогона
    });
  }
  await commitIfNeeded();
}
await commitIfNeeded(true);

console.log('Записано новых отметок:', totalWritten);
console.log('Пропущено (уже было в новой системе):', totalSkippedExisting);
console.log('Пропущено (нет такого урока в новой системе):', totalSkippedNoLesson, [...new Set(missingLessons)].slice(0, 20));
console.log('Пропущено (студент не найден в активных записях группы):', totalSkippedNoStudent, [...new Set(unmatchedStudents)]);
process.exit(0);
