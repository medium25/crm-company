/**
 * Asadbek Baxtiyorov: у них status=5(active) список его не включает
 * (groups=[] — нет текущего группового членства), но он есть в debtors.
 * У нас после разархивации стоял status=active без enrollment, из-за
 * этого попадал в "активные студенты" лишним. Меняю на paused —
 * остаётся должником (countDebtors берёт active/trial/paused), но не
 * активным студентом, как в старой системе.
 *
 *   node --env-file=.env scripts/fix-asadbek-status.mjs --apply
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
  await updateDoc(doc(db, 'students', '5vOFUudnqx1kFt6wkB1w'), {
    status: 'paused',
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  console.log('Готово: Asadbek Baxtiyorov -> paused.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
