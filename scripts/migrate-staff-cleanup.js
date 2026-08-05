/**
 * Одноразовая миграция сотрудников:
 *  1. Удаляет staff-документы тестовых/лишних аккаунтов (Sadullo, 2x Muslima,
 *     Umid) — доступ в CRM пропадает, но их группы/студенты/посещаемость
 *     не трогает (привязаны к teacherId, не к staff-аккаунту).
 *  2. Переводит аккаунт владельца (SEED_ADMIN) с email/пароль на
 *     телефон/пароль-по-номеру — новый Auth-аккаунт (Firebase не даёт менять
 *     email существующего без подтверждения по почте), staff-документ
 *     переносится на новый uid, старый staff-документ удаляется.
 *     Логин: {998+номер}@icon-crm.local, пароль: номер без 998.
 *
 *   node --env-file=.env scripts/migrate-staff-cleanup.js
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { phoneToAuthEmail } from '../src/lib/auth.js';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const OWNER_NEW_PHONE = '998900064544';
const OWNER_NEW_PASSWORD = '900064544';
const EMAILS_TO_DELETE = ['iconuzbekistan@gmail.com', 'icon1@gmail.com', 'icon2@gmail.com', 'icon@gmail.com'];

async function main() {
  const { SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD } = process.env;
  if (!SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
    throw new Error('Нужны SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD в .env');
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD);
  console.log(`Вошли как ${SEED_ADMIN_EMAIL} (uid ${user.uid})`);

  const staffSnap = await getDocs(collection(db, 'staff'));
  const staffList = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Всего staff-документов: ${staffList.length}`);

  const toDelete = staffList.filter((s) => EMAILS_TO_DELETE.includes(s.email));
  console.log(`К удалению: ${toDelete.map((s) => `${s.fullName} <${s.email}>`).join(', ') || 'ничего не найдено'}`);

  for (const staff of toDelete) {
    // eslint-disable-next-line no-await-in-loop -- маленький список, последовательно и явно
    await deleteDoc(doc(db, 'staff', staff.id));
    console.log(`Удалён staff/${staff.id} (${staff.fullName})`);
  }

  // Firebase больше не разрешает updateEmail() на существующем аккаунте без
  // подтверждения по почте (auth/operation-not-allowed) — для синтетического
  // {phone}@icon-crm.local это в принципе невозможно (письмо некуда слать).
  // Поэтому вместо мутации аккаунта — заводим НОВЫЙ Auth-аккаунт (тот же
  // приём, что и AddStaffModal для учителей) и переносим staff-документ на
  // новый uid. Старый email/пароль остаётся валиден в Firebase Auth, но
  // без staff-документа приложение его больше не пускает (staff/{oldUid}
  // удаляется) — фактически деактивирован, как и остальные четверо выше.
  const ownerSnap = await getDoc(doc(db, 'staff', user.uid));
  const ownerData = ownerSnap.data();
  const ownerAuthEmail = phoneToAuthEmail(OWNER_NEW_PHONE);

  const tempApp = initializeApp(firebaseConfig, `owner-migrate-${Date.now()}`);
  const tempAuth = getAuth(tempApp);
  const { user: newOwnerUser } = await createUserWithEmailAndPassword(tempAuth, ownerAuthEmail, OWNER_NEW_PASSWORD);
  await deleteApp(tempApp);

  await setDoc(doc(db, 'staff', newOwnerUser.uid), {
    ...ownerData,
    phone: OWNER_NEW_PHONE,
    email: '',
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  await deleteDoc(doc(db, 'staff', user.uid));
  console.log(`Новый staff-аккаунт владельца: uid ${newOwnerUser.uid}, логин ${ownerAuthEmail}`);
  console.log(`Старый staff/${user.uid} удалён (старый email/пароль в Auth остался, но без staff-документа доступа в CRM нет).`);

  // Проверка: новый логин действительно работает.
  const verifyApp = initializeApp(firebaseConfig, 'verify');
  const verifyAuth = getAuth(verifyApp);
  await signInWithEmailAndPassword(verifyAuth, ownerAuthEmail, OWNER_NEW_PASSWORD);
  console.log('✅ Проверка входа по новому телефону/паролю — успешно.');

  console.log(`\nГотово. Удалено сотрудников: ${toDelete.length}. Новый логин владельца: ${OWNER_NEW_PHONE} / пароль ${OWNER_NEW_PASSWORD}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('ОШИБКА:', err);
  process.exit(1);
});
