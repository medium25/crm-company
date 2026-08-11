/**
 * TEUZ7WQcwap0iBtUZ3d8 "Kitob" — фантомная карточка, 3 платежа по 55000
 * (08-07, click), все createdBy=seed-скрипт ("Doniyor Shavkatov"), не
 * старой системы данные — похоже, утекло из отладки методики сверки
 * (тестировал add-*-payment на "Kitob" и не подчистил). Реальная карточка
 * "Kitob" — juNXAaPJv8opPhqMcOSP (все 4 платежа от сотрудника Muslima
 * Shokirova, совпадает со старой системой).
 *
 * Удаляю 3 фантомных платежа, архивирую фантомную карточку (удалить
 * нельзя — firestore.rules).
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { deleteTransaction } from '../src/lib/billing.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};
const PHANTOM_ID = 'TEUZ7WQcwap0iBtUZ3d8';

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const txSnap = await getDocs(query(collection(db, 'transactions'), where('studentId', '==', PHANTOM_ID)));
  for (const d of txSnap.docs) {
    // eslint-disable-next-line no-await-in-loop
    await deleteTransaction(db, { id: d.id, ...d.data() });
    console.log('Удалён фантомный платёж:', d.id);
  }

  await updateDoc(doc(db, 'students', PHANTOM_ID), {
    isArchived: true,
    status: 'left',
    note: 'Фантомная тестовая карточка-дубль "Kitob", создана скриптом по ошибке, не реальные данные.',
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  console.log('Фантомная карточка архивирована.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
