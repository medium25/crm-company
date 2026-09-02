import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc, query, where, writeBatch } from 'firebase/firestore';

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

const snap = await getDocs(query(collection(db, 'transactions'), where('type', '==', 'payment')));
const targets = snap.docs.filter((d) => {
  const t = d.data();
  return t.groupId && !t.teacherId;
});
console.log(`Найдено ${targets.length} оплат с группой, но без учителя.`);

const groupCache = new Map();
async function getGroup(groupId) {
  if (groupCache.has(groupId)) return groupCache.get(groupId);
  const g = await getDoc(doc(db, 'groups', groupId));
  const data = g.exists() ? g.data() : null;
  groupCache.set(groupId, data);
  return data;
}

let batch = writeBatch(db);
let inBatch = 0;
let patched = 0;
let skippedNoGroupDoc = 0;
for (const d of targets) {
  const t = d.data();
  const group = await getGroup(t.groupId);
  if (!group || !group.teacherId) {
    skippedNoGroupDoc += 1;
    continue;
  }
  batch.update(doc(db, 'transactions', d.id), { teacherId: group.teacherId, teacherName: group.teacherName ?? null });
  inBatch += 1;
  patched += 1;
  if (inBatch >= 400) {
    await batch.commit();
    batch = writeBatch(db);
    inBatch = 0;
  }
}
if (inBatch > 0) await batch.commit();

console.log(`Пропатчено: ${patched}. Пропущено (группа не найдена/без учителя): ${skippedNoGroupDoc}.`);
process.exit(0);
