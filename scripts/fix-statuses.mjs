import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { recomputeStudentAggregates } from '../src/lib/students.js';

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
const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

async function findStudentByPhone(phone) {
  const snap = await getDocs(query(collection(db, 'students'), where('phone', '==', phone)));
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function enrollmentsFor(studentId) {
  const snap = await getDocs(query(collection(db, 'enrollments'), where('studentId', '==', studentId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// телефон -> новый статус enrollment + опционально freeze даты
const TO_TRIAL = ['998947799230', '998991097696', '998958804333', '998937777753', '998505764814'];
const TO_PAUSED = [
  { phone: '998888520707', from: null, to: null }, // Shaxnoza Bafayeva
  { phone: '998950500506', from: null, to: null }, // Xojiakbar
  { phone: '998998413349', from: '2026-08-05', to: '2026-08-12' }, // Habibulloh Jo'rayev
];

console.log('--- Zarnigor: фикс формата телефона ---');
{
  const bad = await findStudentByPhone('951008623');
  if (bad) {
    console.log(`${APPLY ? 'ПРАВКА' : 'dry-run'}: ${bad.fullName} phone 951008623 -> 998951008623`);
    if (APPLY) await updateDoc(doc(db, 'students', bad.id), { phone: '998951008623', updatedAt: serverTimestamp(), updatedBy: user.uid });
  } else console.log('не найден (уже поправлен?)');
}

console.log('\n--- -> trial ---');
for (const phone of TO_TRIAL) {
  const s = await findStudentByPhone(phone);
  if (!s) { console.log(`${phone}: не найден`); continue; }
  const ens = await enrollmentsFor(s.id);
  const active = ens.find((e) => e.status === 'active');
  if (!active) { console.log(`${s.fullName}: активного enrollment не найдено`); continue; }
  console.log(`${APPLY ? 'ПРАВКА' : 'dry-run'}: ${s.fullName} enrollment ${active.groupCode} active -> trial`);
  if (APPLY) {
    await updateDoc(doc(db, 'enrollments', active.id), { status: 'trial', statusLabel: 'Пробный урок', updatedAt: serverTimestamp(), updatedBy: user.uid });
    await recomputeStudentAggregates(db, s.id);
  }
}

console.log('\n--- -> paused (заморожен) ---');
for (const t of TO_PAUSED) {
  const s = await findStudentByPhone(t.phone);
  if (!s) { console.log(`${t.phone}: не найден`); continue; }
  const ens = await enrollmentsFor(s.id);
  const active = ens.find((e) => e.status === 'active');
  if (!active) { console.log(`${s.fullName}: активного enrollment не найдено`); continue; }
  console.log(`${APPLY ? 'ПРАВКА' : 'dry-run'}: ${s.fullName} enrollment ${active.groupCode} active -> paused (${t.from ?? '—'} .. ${t.to ?? '—'})`);
  if (APPLY) {
    await updateDoc(doc(db, 'enrollments', active.id), {
      status: 'paused',
      statusLabel: 'Заморожен',
      pausedFrom: t.from ? Timestamp.fromDate(new Date(`${t.from}T00:00:00`)) : null,
      pausedTo: t.to ? Timestamp.fromDate(new Date(`${t.to}T00:00:00`)) : null,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    });
    await recomputeStudentAggregates(db, s.id);
  }
}

console.log('\n--- Ulug\'bek Raimqulov: разархивировать ---');
{
  const s = await findStudentByPhone('998940208150');
  if (!s) console.log('не найден');
  else {
    const ens = await enrollmentsFor(s.id);
    const arch = ens.find((e) => e.groupCode === 'R37');
    console.log(`${APPLY ? 'ПРАВКА' : 'dry-run'}: ${s.fullName} isArchived true -> false, enrollment archived -> active`);
    if (APPLY) {
      await updateDoc(doc(db, 'students', s.id), { isArchived: false, updatedAt: serverTimestamp(), updatedBy: user.uid });
      if (arch) {
        await updateDoc(doc(db, 'enrollments', arch.id), { status: 'active', statusLabel: 'Активен (Оплачивает обучение)', isArchived: false, updatedAt: serverTimestamp(), updatedBy: user.uid });
      }
      await recomputeStudentAggregates(db, s.id);
    }
  }
}

console.log(APPLY ? '\nГотово.' : '\ndry-run. Запусти с --apply.');
process.exit(0);
