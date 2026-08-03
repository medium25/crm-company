/**
 * Phase 2, часть 2 — платежи студентов, которых нет среди активных (архив/
 * лид/выбывшие). Пишутся как транзакции БЕЗ привязки к карточке студента
 * (studentId: null, studentName — как в modme), чтобы "Все платежи" в
 * Финансах совпадали 1:1 с modme. Персональной истории на карточке для них
 * не формируется — по решению пользователя такие студенты не переносились
 * в Phase 1, но их оплаты должны учитываться в общей сумме.
 *
 *   node --env-file=.env scripts/_migrate_phase2_unmatched.mjs
 */
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const BRANCH_ID = 'icon-main';

const METHOD_MAP = {
  Cash: 'cash',
  Click: 'click',
  UZCARD: 'uzcard',
  Payme: 'payme',
  Uzum: 'uzum',
  Humo: 'humo',
  'Bank account': 'transfer',
};

function normName(s) {
  return s.replace(/[`’‘]/g, "'").trim().toLowerCase();
}

function parseDate(d) {
  const [dd, mm, yyyy] = d.split('.');
  return `${yyyy}-${mm}-${dd}`;
}

function parseRow(line) {
  const cols = line.split('\t');
  if (cols.length < 8) return null;
  const [date, name, sumRaw, method, teacher, group, creator, createdAt] = cols;
  const amount = Number(sumRaw.replace(/[^\d]/g, ''));
  return { date, name: name.trim(), amount, method: method.trim(), teacher: teacher.trim(), group: group.trim(), creator: creator.trim(), createdAt: createdAt.trim() };
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('isArchived', '==', false)));
  const activeNames = new Set();
  studentsSnap.forEach((d) => activeNames.add(normName(d.data().fullName)));

  const groupsSnap = await getDocs(collection(db, 'groups'));
  const groupByCode = new Map();
  groupsSnap.forEach((d) => groupByCode.set(d.data().code, { id: d.id, ...d.data() }));

  const files = Array.from({ length: 25 }, (_, i) => i + 1).map((n) => `scripts/_phase2_raw_page${n}.txt`);
  const rows = [];
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const row = parseRow(line);
      if (row) rows.push(row);
    }
  }

  const unmatched = rows.filter((row) => !activeNames.has(normName(row.name)));

  let written = 0;
  let writtenSum = 0;
  const batchSize = 400;
  let batch = writeBatch(db);
  let n = 0;

  for (const row of unmatched) {
    const group = groupByCode.get(row.group) ?? null;
    const ref = doc(collection(db, 'transactions'));
    batch.set(ref, {
      id: ref.id,
      branchId: BRANCH_ID,
      studentId: null,
      studentName: row.name,
      enrollmentId: null,
      groupId: group?.id ?? null,
      groupCode: group?.code ?? row.group ?? null,
      teacherId: group?.teacherId ?? null,
      teacherName: group?.teacherName ?? row.teacher ?? null,
      type: 'payment',
      amount: row.amount,
      method: METHOD_MAP[row.method] ?? 'cash',
      date: Timestamp.fromDate(new Date(`${parseDate(row.date)}T00:00:00`)),
      month: parseDate(row.date).slice(0, 7),
      comment: 'modme: студент не в активной базе (архив/лид) — перенесено только для сверки общей суммы',
      periodFrom: null,
      periodTo: null,
      lessonsCount: null,
      createdBy: uid,
      createdByName: row.creator,
      createdAt: Timestamp.fromDate(new Date(row.createdAt.replace(' ', 'T'))),
      isReversed: false,
      reversedBy: null,
    });
    written++;
    writtenSum += row.amount;
    n++;
    if (n % batchSize === 0) {
      await batch.commit();
      batch = writeBatch(db);
    }
  }
  await batch.commit();

  console.log(`Строк без активного студента: ${unmatched.length}`);
  console.log(`Записано транзакций (studentId=null): ${written}`);
  console.log(`Сумма: ${writtenSum.toLocaleString('ru-RU')} UZS`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
