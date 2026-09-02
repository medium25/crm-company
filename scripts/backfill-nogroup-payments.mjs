import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, query, where, writeBatch } from 'firebase/firestore';

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

// Все платежи (type:'payment') без groupId — по всей истории, тот же баг
// (AddPaymentModal прятал селектор группы при ровно 1 активной записи,
// см. коммит "fix(finance): группа обязательна / авто-привязка при 1
// зачислении"). Однозначно восстановить можно только когда у студента
// СЕЙЧАС ровно одно активное зачисление — иначе неясно, к какой группе
// относился платёж, пропускаем.
const paymentsSnap = await getDocs(query(collection(db, 'transactions'), where('type', '==', 'payment')));
const targets = paymentsSnap.docs.filter((d) => !d.data().groupId);
console.log(`Оплат без groupId: ${targets.length}`);

const studentIds = [...new Set(targets.map((d) => d.data().studentId))];
const enrollmentsByStudent = new Map();
for (const studentId of studentIds) {
  const eSnap = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', studentId)));
  const active = eSnap.docs
    .map((d) => d.data())
    .filter((e) => e.status !== 'left' && e.status !== 'archived');
  enrollmentsByStudent.set(studentId, active);
}

let batch = writeBatch(db);
let inBatch = 0;
let patched = 0;
let skippedAmbiguous = 0;
let skippedNoEnrollment = 0;
for (const d of targets) {
  const t = d.data();
  const active = enrollmentsByStudent.get(t.studentId) ?? [];
  if (active.length === 0) { skippedNoEnrollment += 1; continue; }
  if (active.length > 1) { skippedAmbiguous += 1; continue; }
  const en = active[0];
  batch.update(doc(db, 'transactions', d.id), {
    groupId: en.groupId ?? null,
    groupCode: en.groupCode ?? null,
    teacherId: en.teacherId ?? null,
    teacherName: en.teacherName ?? null,
  });
  inBatch += 1;
  patched += 1;
  if (inBatch >= 400) {
    await batch.commit();
    batch = writeBatch(db);
    inBatch = 0;
  }
}
if (inBatch > 0) await batch.commit();

console.log(`Пропатчено: ${patched}. Пропущено (несколько активных групп): ${skippedAmbiguous}. Пропущено (нет активной группы вообще): ${skippedNoEnrollment}.`);
process.exit(0);
