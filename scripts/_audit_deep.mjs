/**
 * READ-ONLY углублённый аудит: посещаемость, monthlyBalance vs transactions,
 * будущие уроки, дубли, статусы модме vs наши.
 *
 *   node --env-file=.env scripts/_audit_deep.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, collectionGroup, getDocs, doc, getDoc } from 'firebase/firestore';

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
  await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  console.log('=== ATTENDANCE (Phase 3) ===');
  try {
    const attSnap = await getDocs(collectionGroup(db, 'attendance'));
    console.log(`Всего документов attendance (все подколлекции lessons/*/attendance): ${attSnap.size}`);
    if (attSnap.size > 0) {
      const months = new Set();
      attSnap.forEach((d) => months.add(d.data().month));
      console.log('Месяцы с посещаемостью:', [...months].sort().join(', '));
    }
  } catch (e) {
    console.log(`collectionGroup(attendance) недоступен (правила не задеплоены): ${e.message}`);
  }

  console.log('\n=== LESSONS: план vs будущее ===');
  const lessonsSnap = await getDocs(collection(db, 'lessons'));
  const today = new Date('2026-08-02');
  let future = 0, past = 0, held = 0, planned = 0, cancelled = 0;
  const futureMonths = new Set();
  lessonsSnap.forEach((d) => {
    const l = d.data();
    const date = l.date?.toDate?.() ?? new Date(l.dateKey);
    if (date > today) { future++; futureMonths.add(l.month); } else past++;
    if (l.status === 'held') held++;
    else if (l.status === 'planned') planned++;
    else if (l.status === 'cancelled') cancelled++;
  });
  console.log(`Прошедшие: ${past}, будущие: ${future} (месяцы будущих: ${[...futureMonths].sort().join(', ')})`);
  console.log(`По статусу: held=${held}, planned=${planned}, cancelled=${cancelled}`);

  console.log('\n=== MONTHLY BALANCE vs TRANSACTIONS ===');
  const mbSnap = await getDocs(collection(db, 'monthlyBalances'));
  console.log(`monthlyBalance документов: ${mbSnap.size}`);
  let mbBalanceSum = 0;
  const mbByMonth = {};
  mbSnap.forEach((d) => {
    const m = d.data();
    mbBalanceSum += m.balance || 0;
    mbByMonth[m.month] = (mbByMonth[m.month] || 0) + 1;
  });
  console.log('Документов по месяцам:', mbByMonth);

  console.log('\n=== ДУБЛИ ТЕЛЕФОНОВ (детали) ===');
  const studentsSnap = await getDocs(collection(db, 'students'));
  const students = studentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byPhone = {};
  students.filter((s) => !s.isArchived).forEach((s) => {
    if (!s.phone) return;
    (byPhone[s.phone] ??= []).push(s);
  });
  Object.entries(byPhone).filter(([, v]) => v.length > 1).forEach(([phone, list]) => {
    console.log(`${phone}:`);
    list.forEach((s) => console.log(`  - ${s.fullName} (id=${s.id}, publicId=${s.publicId}, balance=${s.balance})`));
  });

  console.log('\n=== ГРУППЫ БЕЗ АКТИВНЫХ УЧЕНИКОВ ===');
  const groupsSnap = await getDocs(collection(db, 'groups'));
  const groups = groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const enrollSnap = await getDocs(collection(db, 'enrollments'));
  const enrollments = enrollSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  groups.filter((g) => !g.isArchived).forEach((g) => {
    const count = enrollments.filter((e) => e.groupId === g.id && !e.isArchived).length;
    if (count !== g.studentsCount) {
      console.log(`Расхождение studentsCount: группа ${g.code} — поле=${g.studentsCount}, факт активных enrollments=${count}`);
    }
  });

  console.log('\n=== TEACHER t_kamilla (groupsCount=0) ===');
  const kamillaGroups = groups.filter((g) => g.teacherId === 't_kamilla');
  console.log(`Групп с teacherId=t_kamilla: ${kamillaGroups.length}`, kamillaGroups.map(g => `${g.code}(archived=${g.isArchived})`));

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
