import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, deleteDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
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

// Marjona Ungboyeva: списание за август, которого нет в старой системе
const marjona = { studentId: 'gKotsiRNFB1x1n87ihs1', studentName: 'Marjona Ungboyeva', txId: 'charge_yyda5ZFRb5BPk2tavDcL_2026-08', amount: -900000, targetBalance: 910000 };
// Xojiakbar: платёж за апрель, которого нет в старой системе
const xojiakbar = { studentId: 'PiiddxMiGbGXZBWITicM', studentName: 'Xojiakbar', txId: 'FgBAxheoQbHD8Tl83dPx', amount: 100000, targetBalance: -363076.92 };

for (const t of [marjona, xojiakbar]) {
  console.log(`${APPLY ? 'УДАЛЕНИЕ' : 'dry-run'}: ${t.studentName} — транзакция ${t.txId} (${t.amount}), баланс -> ${t.targetBalance}`);
  if (APPLY) {
    await deleteDoc(doc(db, 'transactions', t.txId));
    await updateDoc(doc(db, 'students', t.studentId), { balance: t.targetBalance, balanceUpdatedAt: serverTimestamp() });
  }
}
console.log(APPLY ? '\nГотово.' : '\ndry-run. Запусти с --apply.');
process.exit(0);
