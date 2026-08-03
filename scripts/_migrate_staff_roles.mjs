/**
 * Переход на новую матрицу должностей: owner→ceo, admin/manager/ceo —
 * равнозначный полный доступ, accountant упразднена (в базе никого с ней
 * не было). Разово переносит существующую запись staff с role: 'owner'
 * на role: 'ceo'.
 *
 *   node --env-file=.env scripts/_migrate_staff_roles.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore';

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
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  const uid = user.uid;

  const snap = await getDocs(collection(db, 'staff'));
  const batch = writeBatch(db);
  let n = 0;
  snap.forEach((d) => {
    const s = d.data();
    if (s.role === 'owner') {
      batch.update(doc(db, 'staff', d.id), { role: 'ceo', fullName: s.fullName === 'Owner' ? 'CEO' : s.fullName, updatedAt: serverTimestamp(), updatedBy: uid });
      console.log('owner -> ceo:', s.fullName, d.id);
      n++;
    } else if (s.role === 'accountant') {
      console.log('ВНИМАНИЕ: найден accountant, роли больше нет — решить руками:', s.fullName, d.id);
    }
  });

  if (n === 0) console.log('Нечего мигрировать — записей с role=owner нет.');
  await batch.commit();
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
