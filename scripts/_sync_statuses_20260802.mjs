/**
 * Синхронизация статусов student/enrollment со старой системой (modme) —
 * 8 студентов, у которых статус в modme разошёлся с нашим 'active':
 *  - 1 заморожен (Frozen) — Asliddin G'apporov, с 15.06.2026.
 *  - 7 ушли из активной группы (Left active group) 01.08.2026, группы R33/R34/R7.
 * Собрано вручную через Browser pane 02.08.2026.
 *
 *   node --env-file=.env scripts/_sync_statuses_20260802.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, serverTimestamp, increment, Timestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

function ts(dateStr) {
  return Timestamp.fromDate(new Date(`${dateStr}T00:00:00`));
}
function tsDt(dateTimeStr) {
  return Timestamp.fromDate(new Date(dateTimeStr));
}

const PAUSED = [{ fullName: "Asliddin G'apporov", pausedFrom: '2026-06-15' }];

const LEFT = [
  { fullName: 'Shaxriyor Qurbonbayev', leftAt: '2026-08-01T18:34:00', reason: 'Sababsiz' },
  { fullName: 'Jafar Sayfiddinov', leftAt: '2026-08-01T18:31:00', reason: 'Sababsiz' },
  { fullName: 'Iroda Karimova', leftAt: '2026-08-01T18:29:00', reason: 'Sababsiz' },
  { fullName: 'Asadbek Baxtiyorov', leftAt: '2026-08-01T18:23:00', reason: 'Sababsiz' },
  { fullName: 'Nodira Axmadjonova', leftAt: '2026-08-01T17:55:00', reason: 'Sababsiz' },
  { fullName: 'Muxlisa Mahmudova', leftAt: '2026-08-01T17:46:00', reason: 'Sababsiz' },
  { fullName: 'Xasan Urozov', leftAt: '2026-08-01T15:49:00', reason: 'Sababsiz' },
];

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('isArchived', '==', false)));
  const studentByName = new Map();
  studentsSnap.forEach((d) => studentByName.set(d.data().fullName, { id: d.id, ...d.data() }));

  const enrollmentsSnap = await getDocs(query(collection(db, 'enrollments'), where('isArchived', '==', false), where('status', '==', 'active')));
  const enrollByStudentId = new Map();
  enrollmentsSnap.forEach((d) => enrollByStudentId.set(d.data().studentId, { id: d.id, ...d.data() }));

  const batch = writeBatch(db);
  let n = 0;

  for (const p of PAUSED) {
    const student = studentByName.get(p.fullName);
    if (!student) throw new Error(`Не найден: ${p.fullName}`);
    const enroll = enrollByStudentId.get(student.id);
    batch.update(doc(db, 'students', student.id), {
      status: 'paused',
      statusReason: 'Frozen (заморожен) в modme',
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    if (enroll) {
      batch.update(doc(db, 'enrollments', enroll.id), {
        status: 'paused',
        statusLabel: 'Заморожен',
        pausedFrom: ts(p.pausedFrom),
        pausedTo: null,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
    n++;
    console.log('PAUSED:', p.fullName, enroll ? `(enrollment ${enroll.id})` : '(без активного enrollment!)');
  }

  for (const l of LEFT) {
    const student = studentByName.get(l.fullName);
    if (!student) throw new Error(`Не найден: ${l.fullName}`);
    const enroll = enrollByStudentId.get(student.id);
    batch.update(doc(db, 'students', student.id), {
      status: 'left',
      statusReason: l.reason,
      leftAt: tsDt(l.leftAt),
      activeGroupsCount: 0,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
    if (enroll) {
      batch.update(doc(db, 'enrollments', enroll.id), {
        status: 'left',
        statusLabel: 'Ушёл',
        leftAt: tsDt(l.leftAt),
        leftReason: l.reason,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'groups', enroll.groupId), { studentsCount: increment(-1) });
    }
    n++;
    console.log('LEFT:', l.fullName, enroll ? `(enrollment ${enroll.id}, group ${enroll.groupCode})` : '(без активного enrollment!)');
  }

  await batch.commit();
  console.log(`Готово. Обновлено студентов: ${n}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
