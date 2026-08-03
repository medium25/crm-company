/**
 * Teacher t_sanjar (MR SANJAR) в modme сейчас отображается как MR IBROHIM
 * (тел. 77 777 77 77) на всех 6 своих группах (I5,I6,I7,I12,I13,I14) —
 * либо переименование, либо смена преподавателя, но для 100% совпадения
 * с текущим состоянием modme переименовываем запись и все ссылки.
 * Заодно пересчитываем teachers.groupsCount (было устаревшее значение).
 *
 *   node --env-file=.env scripts/_fix_teacher_ibrohim.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';

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

  const batch = writeBatch(db);

  batch.update(doc(db, 'teachers', 't_sanjar'), {
    displayName: 'MR IBROHIM',
    fullName: 'MR IBROHIM',
    phone: '998777777777',
    groupsCount: 6,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'teachers', 't_kristina'), { groupsCount: 10, updatedBy: uid, updatedAt: serverTimestamp() });

  const groupsSnap = await getDocs(query(collection(db, 'groups'), where('teacherId', '==', 't_sanjar')));
  groupsSnap.forEach((d) => batch.update(doc(db, 'groups', d.id), { teacherName: 'MR IBROHIM' }));
  console.log('Групп обновлено:', groupsSnap.size);

  const enrollSnap = await getDocs(query(collection(db, 'enrollments'), where('teacherId', '==', 't_sanjar'), where('isArchived', '==', false)));
  enrollSnap.forEach((d) => batch.update(doc(db, 'enrollments', d.id), { teacherName: 'MR IBROHIM' }));
  console.log('Зачислений обновлено:', enrollSnap.size);

  await batch.commit();
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
