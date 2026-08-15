/**
 * Одноразовая очистка — архивирует лидов, созданных бэкфиллом через
 * appsscript/Code.gs (createLead_ ставит createdBy: 'api:<имя ключа>').
 * Пользователь попросил удалить весь бэкфилл 15.08.2026 — не смог
 * сопоставить созданные лиды со строками в Google Sheets (таблица начата
 * заново с START_ROW). Настоящее удаление недоступно — firestore.rules
 * запрещает delete на students (allow delete: if false, намеренно), поэтому
 * архивируем (isArchived: true) — тот же эффект, пропадают со всех досок.
 * Скрипт одноразовый, удали после прогона.
 *
 *   node --env-file=.env scripts/delete-api-backfill-leads.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc, serverTimestamp } from 'firebase/firestore';

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

// createdBy — строка вида 'api:Google Sheets'. Диапазон 'api:'..'api:'
// ловит любой префикс 'api:*' без доп. индекса на equality+prefix.
const q = query(
  collection(db, 'students'),
  where('createdBy', '>=', 'api:'),
  where('createdBy', '<', 'api:'),
);
const snap = await getDocs(q);

console.log(`Найдено ${snap.size} лидов с createdBy начинающимся на "api:":`);
snap.docs.forEach((d) => console.log(`  ${d.id}  ${d.data().fullName}  ${d.data().phone}  createdBy=${d.data().createdBy}`));

if (snap.size === 0) {
  console.log('Нечего удалять.');
  process.exit(0);
}

// firestore.rules: allow delete: if false для students — жёсткое удаление
// запрещено намеренно (архитектура проекта, не баг). Архивируем вместо
// удаления — тот же эффект (пропадают со всех досок/списков), без
// нарушения правил.
for (const d of snap.docs) {
  await updateDoc(doc(db, 'students', d.id), {
    isArchived: true,
    archivedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
console.log(`Архивировано: ${snap.size}`);
process.exit(0);
