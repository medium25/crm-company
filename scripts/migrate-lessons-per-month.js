/**
 * Одноразовая миграция: база для pricePerLesson (`lessonsPerMonth`) меняется
 * с 14 на 12 — цена курса (840к/890к) фиксирована за 12 уроков в месяц,
 * 13-й/14-й — бонусные (см. «03 · Бизнес-логика» §3.1). Значение 14 было
 * плейсхолдером под открытый вопрос в спеке, заказчик подтвердил 12.
 *
 * Меняет только документы, где сейчас РОВНО 14 (branches + groups) —
 * если где-то стоит другое кастомное значение, его не трогает. Фиксированные
 * ежемесячные списания (chargeMonthly = -enrollment.price) от этого поля не
 * зависят и не пересчитываются; уже созданные транзакции не трогает —
 * меняется только база для будущей прорации (новый студент/заморозка).
 *
 *   node --env-file=.env scripts/migrate-lessons-per-month.js
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, writeBatch, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const OLD_VALUE = 14;
const NEW_VALUE = 12;

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Нужны SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD в .env');
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);

  const branchesSnap = await getDocs(collection(db, 'branches'));
  const branchesToUpdate = branchesSnap.docs.filter((d) => d.data().lessonsPerMonth === OLD_VALUE);

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('lessonsPerMonth', '==', OLD_VALUE)));

  console.log(`Филиалов с lessonsPerMonth=${OLD_VALUE}: ${branchesToUpdate.length}`);
  console.log(`Групп с lessonsPerMonth=${OLD_VALUE}: ${groupsSnap.size}`);

  const allDocs = [...branchesToUpdate, ...groupsSnap.docs];
  for (let i = 0; i < allDocs.length; i += 400) {
    const batch = writeBatch(db);
    for (const d of allDocs.slice(i, i + 400)) {
      batch.update(doc(db, d.ref.parent.id, d.id), {
        lessonsPerMonth: NEW_VALUE,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    }
    // eslint-disable-next-line no-await-in-loop -- батчи по 400 обязаны идти последовательно
    await batch.commit();
  }

  console.log(`Готово. Обновлено филиалов: ${branchesToUpdate.length}, групп: ${groupsSnap.size}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
