/**
 * Zubayr Ahromov (R3->R4) и Aydin Adilova (R6->R33) получили status:'left'
 * на старом enrollment — это ошибочно засчиталось в KPI «Ушли из активной
 * группы» (countLeftActiveGroup фильтрует именно status=='left'). Перевод
 * между группами — не уход, меняем статус старой записи на 'archived'.
 *
 *   node --env-file=.env scripts/_fix_transfer_status.mjs
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

  const names = ['Zubayr Ahromov', 'Aydin Adilova'];
  const batch = writeBatch(db);
  for (const name of names) {
    const studentSnap = await getDocs(query(collection(db, 'students'), where('fullName', '==', name)));
    const studentId = studentSnap.docs[0].id;
    const enrollSnap = await getDocs(
      query(collection(db, 'enrollments'), where('studentId', '==', studentId), where('status', '==', 'left')),
    );
    for (const e of enrollSnap.docs) {
      batch.update(doc(db, 'enrollments', e.id), {
        status: 'archived',
        statusLabel: 'Перевёлся в другую группу',
        leftAt: null,
        leftReason: null,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      console.log('FIXED enrollment status:', name, e.data().groupCode, 'left -> archived');
    }
  }
  await batch.commit();
  console.log('Готово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
