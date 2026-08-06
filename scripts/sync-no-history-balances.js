/**
 * Массовая сверка баланса для 98 студентов из "Без истории списаний (врем.)" —
 * для каждого ищем баланс в старой системе (icon.modme.uz, снимок собран
 * вручную по всем 335 записям /students/list) и, если разошлось, добавляем
 * одну корректирующую транзакцию (не за август — чтобы студент вышел из
 * временного фильтра списка). Пользователь потом сам открывает карточку,
 * сверяет и жмёт «Готово».
 *
 *   node --env-file=.env scripts/sync-no-history-balances.js
 *   node --env-file=.env scripts/sync-no-history-balances.js --apply
 */
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { writeTransaction } from '../src/lib/billing.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const BRANCH_ID = 'icon-main';
const CURRENT_MONTH = '2026-08';
const APPLY = process.argv.includes('--apply');

const OLD_ROSTER_PATH = '/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/be1ba6fd-58d1-4187-8d55-6ab9cb97ff58/scratchpad/old_roster.json';

async function main() {
  const oldRoster = JSON.parse(readFileSync(OLD_ROSTER_PATH, 'utf8'));
  const oldByPhone = new Map();
  const phoneCollisions = new Set();
  for (const r of oldRoster) {
    if (!r.phone) continue;
    if (oldByPhone.has(r.phone)) phoneCollisions.add(r.phone);
    oldByPhone.set(r.phone, r);
  }

  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const staffUser = { uid: user.uid, fullName: 'Doniyor Shavkatov' };

  const studentsSnap = await getDocs(query(collection(db, 'students'), where('branchId', '==', BRANCH_ID), where('isArchived', '==', false)));
  const students = [];
  studentsSnap.forEach((d) => students.push({ id: d.id, ...d.data() }));

  const chargesSnap = await getDocs(query(collection(db, 'transactions'), where('branchId', '==', BRANCH_ID), where('type', '==', 'charge')));
  const chargesByStudent = new Map();
  chargesSnap.forEach((d) => {
    const c = d.data();
    if (!chargesByStudent.has(c.studentId)) chargesByStudent.set(c.studentId, []);
    chargesByStudent.get(c.studentId).push(c);
  });
  const inList = (s) => {
    if (s.chargeHistoryReviewed) return false;
    const own = chargesByStudent.get(s.id) ?? [];
    if (own.length === 0) return true;
    return own.length === 1 && own[0].month === CURRENT_MONTH;
  };
  const target = students.filter(inList).sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));

  let matched = 0, alreadyOk = 0, fixed = 0, notFound = 0, ambiguous = 0;

  for (const s of target) {
    const old = oldByPhone.get(s.phone);
    if (!old) {
      console.log(`НЕ НАЙДЕН в старой системе: ${(s.fullName || '').padEnd(28)} phone=${s.phone}`);
      notFound++;
      continue;
    }
    if (phoneCollisions.has(s.phone)) {
      console.log(`НЕОДНОЗНАЧНЫЙ телефон в старой системе: ${(s.fullName || '').padEnd(28)} phone=${s.phone} — пропущено, разберись вручную`);
      ambiguous++;
      continue;
    }
    matched++;
    const delta = old.balance - s.balance;
    if (Math.abs(delta) < 100) {
      alreadyOk++;
      continue;
    }
    console.log(
      `${APPLY ? 'КОРРЕКЦИЯ' : 'dry-run'}: ${(s.fullName || '').padEnd(28)} баланс ${s.balance} -> ${old.balance} (${delta > 0 ? '+' : ''}${delta})`,
    );
    if (APPLY) {
      await writeTransaction(db, {
        branchId: BRANCH_ID,
        studentId: s.id,
        studentName: s.fullName,
        enrollmentId: null,
        groupId: null,
        groupCode: null,
        teacherId: null,
        teacherName: null,
        type: 'correction',
        amount: delta,
        method: null,
        date: new Date('2026-07-31T00:00:00'),
        month: '2026-07',
        comment: 'Сверка баланса со старой системой (icon.modme.uz)',
        periodFrom: null,
        periodTo: null,
        lessonsCount: null,
        createdBy: staffUser.uid,
        createdByName: staffUser.fullName,
      });
    }
    fixed++;
  }

  console.log(`\nВсего в списке: ${target.length}`);
  console.log(`Найдено в старой системе: ${matched}`);
  console.log(`Уже совпадало: ${alreadyOk}`);
  console.log(`${APPLY ? 'Исправлено' : 'Будет исправлено'}: ${fixed}`);
  console.log(`Неоднозначный телефон: ${ambiguous}`);
  console.log(`Не найдено в старой системе: ${notFound}`);
  if (!APPLY) console.log('\nЭто был dry-run. Для реальной записи запусти с флагом --apply');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
