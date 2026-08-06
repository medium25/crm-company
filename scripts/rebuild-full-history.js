/**
 * Полная реконструкция истории списаний/платежей для 93 студентов из
 * "Без истории списаний (врем.)" — построчно, 1 в 1 со старой системой
 * (дата, сумма, кто провёл), а не lump-коррекцией на разницу баланса.
 *
 * Источник: /private/tmp/.../old_ledgers.json — снят через API modme
 * (GET /v1/payment?branch_id=681&user_id={id}) для каждого студента.
 *
 * Алгоритм на студента:
 *  1) Удалить мои старые синтетические transactions type=correction с
 *     комментарием "Сверка баланса..." (sync-no-history-balances.js) —
 *     они больше не нужны, заменяются настоящими записями.
 *  2) Сгруппировать оставшиеся новые транзакции и старые записи по
 *     ключу (type, month, amount) — мультисет.
 *  3) Для каждого ключа, где в старой системе записей больше, чем в
 *     новой — дописать недостающие (столько, на сколько старых больше),
 *     беря точные date/creator/group из старой системы.
 *  4) Новые транзакции, которым не нашлось пары в старой системе —
 *     не трогаем, только печатаем для ручной проверки.
 *
 *   node --env-file=.env scripts/rebuild-full-history.js
 *   node --env-file=.env scripts/rebuild-full-history.js --apply
 */
import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
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
const APPLY = process.argv.includes('--apply');
const LEDGERS_PATH = '/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/be1ba6fd-58d1-4187-8d55-6ab9cb97ff58/scratchpad/old_ledgers.json';

const METHOD_MAP = {
  cash: 'cash',
  click: 'click',
  uzcard: 'uzcard',
  humo: 'humo',
  payme: 'payme',
  uzum: 'uzum',
  card: 'card',
  'bank transfer': 'transfer',
  transfer: 'transfer',
};
function mapMethod(m) {
  if (!m) return 'cash';
  return METHOD_MAP[m.toLowerCase()] ?? 'cash';
}

function monthOf(dateStr) {
  return dateStr.slice(0, 7);
}

async function main() {
  const ledgers = JSON.parse(readFileSync(LEDGERS_PATH, 'utf8'));

  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  const staffUser = { uid: user.uid, fullName: 'Doniyor Shavkatov' };

  const groupsSnap = await getDocs(collection(db, 'groups'));
  const groupsByCode = new Map();
  groupsSnap.forEach((d) => groupsByCode.set(d.data().code, { id: d.id, ...d.data() }));

  let totalAdded = 0;
  let totalFixed = 0;
  let totalRemovedCorrections = 0;
  const anomalies = [];

  for (const [phone, rec] of Object.entries(ledgers)) {
    const sSnap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
    if (sSnap.empty) { console.log(`${rec.name}: студент с телефоном ${phone} не найден в новой системе`); continue; }
    const student = { id: sSnap.docs[0].id, ...sSnap.docs[0].data() };

    const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', student.id)));
    const newTx = [];
    txSnap.forEach((d) => newTx.push({ id: d.id, ...d.data() }));

    // шаг 1: убрать мои lump-коррекции
    const corrections = newTx.filter((t) => t.type === 'correction' && (t.comment || '').startsWith('Сверка баланса'));
    for (const c of corrections) {
      console.log(`${APPLY ? 'УДАЛЕНИЕ' : 'dry-run удаление'}: ${rec.name.padEnd(26)} correction ${c.amount} (${c.id})`);
      if (APPLY) await deleteDoc(doc(db, 'transactions', c.id));
      totalRemovedCorrections++;
    }
    const remainingNewTx = newTx.filter((t) => !corrections.includes(t));

    // старые записи, нормализованные к общему виду
    const oldNorm = rec.tx
      .map((old) => {
        const isPayment = old.debit > 0;
        const amount = isPayment ? old.debit : old.credit;
        if (amount === 0) return null;
        return { old, isPayment, type: isPayment ? 'payment' : 'charge', amount, month: monthOf(old.date) };
      })
      .filter(Boolean);

    // группируем по (type, month) — и старые, и новые
    const groupKey = (type, month) => `${type}|${month}`;
    const oldGroups = new Map();
    for (const o of oldNorm) {
      const k = groupKey(o.type, o.month);
      if (!oldGroups.has(k)) oldGroups.set(k, []);
      oldGroups.get(k).push(o);
    }
    const newGroups = new Map();
    for (const t of remainingNewTx) {
      const type = t.type === 'payment' ? 'payment' : t.type === 'charge' ? 'charge' : null;
      if (!type) continue;
      const k = groupKey(type, t.month);
      if (!newGroups.has(k)) newGroups.set(k, []);
      newGroups.get(k).push(t);
    }

    const allKeys = new Set([...oldGroups.keys(), ...newGroups.keys()]);
    for (const k of allKeys) {
      const oldList = [...(oldGroups.get(k) ?? [])];
      const newList = [...(newGroups.get(k) ?? [])];

      // 1) мультисет-match по округлённой сумме — убираем совпавшие пары
      for (let i = oldList.length - 1; i >= 0; i--) {
        const rounded = Math.round(oldList[i].amount);
        const j = newList.findIndex((t) => Math.round(Math.abs(t.amount)) === rounded);
        if (j !== -1) {
          oldList.splice(i, 1);
          newList.splice(j, 1);
        }
      }

      // 2) остаток 1:1 — считаем это "неверная сумма", правим существующую запись
      while (oldList.length && newList.length) {
        const o = oldList.pop();
        const t = newList.pop();
        const group = groupsByCode.get(o.old.group);
        const dateObj = new Date(o.old.date.replace(' ', 'T'));
        const newAmount = o.isPayment ? o.amount : -o.amount;
        console.log(
          `${APPLY ? 'ПРАВКА СУММЫ' : 'dry-run правка'}: ${rec.name.padEnd(26)} ${o.type.padEnd(7)} ${o.month} ${t.amount} -> ${newAmount} UZS  ${o.old.group ?? ''}  by=${o.old.creator ?? 'система'}`,
        );
        if (APPLY) {
          // Firestore rules: update на transactions разрешает трогать только
          // amount/comment/date/month/updatedAt/updatedBy — groupId/groupCode/
          // createdByName на месте не поправить, только сумму/дату/комментарий.
          await updateDoc(doc(db, 'transactions', t.id), {
            amount: newAmount,
            date: Timestamp.fromDate(dateObj),
            month: o.month,
            comment: o.isPayment
              ? o.old.creator
                ? `перенос из старой системы, ${o.old.creator}`
                : 'перенос из старой системы'
              : o.old.lessons != null
                ? `${o.old.lessons} ур. (перенос из старой системы${o.old.creator ? `, ${o.old.creator}` : ''})`
                : `перенос из старой системы${o.old.creator ? `, ${o.old.creator}` : ''}`,
          });
        }
        totalFixed++;
      }

      // 3) то, что осталось в old — реально недостающие записи, добавляем
      for (const o of oldList) {
        const group = groupsByCode.get(o.old.group);
        const dateObj = new Date(o.old.date.replace(' ', 'T'));
        const comment = o.isPayment
          ? o.old.creator
            ? `перенос из старой системы, ${o.old.creator}`
            : 'перенос из старой системы'
          : o.old.lessons != null
            ? `${o.old.lessons} ур. (перенос из старой системы${o.old.creator ? `, ${o.old.creator}` : ''})`
            : `перенос из старой системы${o.old.creator ? `, ${o.old.creator}` : ''}`;

        console.log(
          `${APPLY ? 'ДОБАВЛЕНИЕ' : 'dry-run'}: ${rec.name.padEnd(26)} ${o.type.padEnd(7)} ${o.month} ${String(o.isPayment ? o.amount : -o.amount).padStart(9)} UZS  ${o.old.group ?? ''}  ${o.old.date}  by=${o.old.creator ?? 'система'}`,
        );

        if (APPLY) {
          if (o.isPayment) {
            await writeTransaction(db, {
              branchId: BRANCH_ID,
              studentId: student.id,
              studentName: student.fullName,
              enrollmentId: null,
              groupId: group?.id ?? null,
              groupCode: o.old.group ?? null,
              teacherId: null,
              teacherName: null,
              type: 'payment',
              amount: o.amount,
              method: mapMethod(o.old.method),
              date: dateObj,
              month: o.month,
              comment,
              periodFrom: null,
              periodTo: null,
              lessonsCount: null,
              createdBy: staffUser.uid,
              createdByName: o.old.creator ?? staffUser.fullName,
            });
          } else {
            await writeTransaction(db, {
              branchId: BRANCH_ID,
              studentId: student.id,
              studentName: student.fullName,
              enrollmentId: null,
              groupId: group?.id ?? null,
              groupCode: o.old.group ?? null,
              teacherId: group?.teacherId ?? null,
              teacherName: group?.teacherName ?? null,
              type: 'charge',
              amount: -o.amount,
              method: null,
              date: dateObj,
              month: o.month,
              comment,
              periodFrom: o.old.from ? new Date(o.old.from) : null,
              periodTo: o.old.to ? new Date(o.old.to) : null,
              lessonsCount: o.old.lessons ?? null,
              createdBy: staffUser.uid,
              createdByName: o.old.creator ?? 'система',
            });
          }
        }
        totalAdded++;
      }

      // 4) то, что осталось в new — без пары в старой системе, на проверку
      for (const t of newList) {
        anomalies.push(`${rec.name} (${phone}): new-only ${k}|${Math.round(t.amount)} (id ${t.id})`);
      }
    }
  }

  console.log(`\n${APPLY ? 'Удалено коррекций' : 'Будет удалено коррекций'}: ${totalRemovedCorrections}`);
  console.log(`${APPLY ? 'Добавлено записей' : 'Будет добавлено записей'}: ${totalAdded}`);
  console.log(`${APPLY ? 'Исправлено сумм' : 'Будет исправлено сумм'}: ${totalFixed}`);
  if (anomalies.length) {
    console.log(`\nNew-only записи без пары в старой системе (${anomalies.length}) — не трогал, проверь вручную:`);
    anomalies.forEach((a) => console.log(`  ${a}`));
  }
  if (!APPLY) console.log('\nЭто был dry-run. Для реальной записи запусти с флагом --apply');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
