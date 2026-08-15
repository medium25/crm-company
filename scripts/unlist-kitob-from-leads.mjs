/**
 * Одноразово: убирает служебный профиль "Kitob" (копилка оплат за книги,
 * специально не заводится в группу) с доски лидов — очищает funnelStage,
 * доска фильтрует именно по нему. isArchived остаётся false — профиль
 * должен и дальше находиться через глобальный поиск для добавления оплат.
 *
 *   node --env-file=.env scripts/unlist-kitob-from-leads.mjs
 */
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, updateDoc, deleteField } from 'firebase/firestore';

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

const snap = await getDocs(query(collection(db, 'students'), where('fullName', '==', 'Kitob')));
if (snap.empty) {
  console.log('Профиль "Kitob" не найден.');
  process.exit(0);
}

for (const d of snap.docs) {
  console.log(`Найден: ${d.id} (id: ${d.data().publicId}), funnelStage=${d.data().funnelStage}`);
  await updateDoc(d.ref, { funnelStage: deleteField() });
  console.log(`  funnelStage очищен.`);
}
process.exit(0);
