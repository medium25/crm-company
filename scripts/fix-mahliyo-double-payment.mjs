/**
 * Баг из fix-mahliyo-duplicate.mjs: при мерже дублей я перенёс её платёж
 * с дубль-карточки на оригинал через recordPayment — не заметив, что у
 * оригинала (JlmOaEpFGnCbWiNoNjEc) УЖЕ был настоящий платёж 840000
 * (07.08, cash, создан сотрудником Muslima Shokirova) задолго до меня.
 * Итог — платёж задвоился (1 680 000 вместо 840 000). Удаляю тот, что
 * создал я (o6ODzk0vqVwIN2h2WTGW), оставляю оригинальный.
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { deleteTransaction } from '../src/lib/billing.js';

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
  await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

  const txSnap = await getDoc(doc(db, 'transactions', 'o6ODzk0vqVwIN2h2WTGW'));
  const tx = { id: 'o6ODzk0vqVwIN2h2WTGW', ...txSnap.data() };
  console.log('Удаляю дубль-платёж:', JSON.stringify(tx));
  await deleteTransaction(db, tx);
  console.log('Готово.');
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
