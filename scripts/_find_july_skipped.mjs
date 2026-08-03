import { readFileSync } from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

function normName(s) {
  return s.replace(/[`’‘]/g, "'").trim().toLowerCase();
}
function parseRow(line) {
  const cols = line.split('\t');
  if (cols.length < 8) return null;
  const [date, name, sumRaw, method, teacher, group, creator, createdAt] = cols;
  const amount = Number(sumRaw.replace(/[^\d]/g, ''));
  return { date, name: name.trim(), amount, method, teacher, group, creator, createdAt };
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

const studentsSnap = await getDocs(query(collection(db, 'students'), where('isArchived', '==', false)));
const activeNames = new Set();
studentsSnap.forEach((d) => activeNames.add(normName(d.data().fullName)));

const files = Array.from({ length: 25 }, (_, i) => i + 1).map((n) => `scripts/_phase2_raw_page${n}.txt`);
let skipped = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = parseRow(line);
    if (!row || !row.date.endsWith('.07.2026')) continue;
    if (!activeNames.has(normName(row.name))) skipped.push(row);
  }
}

let sum = 0;
for (const r of skipped) {
  sum += r.amount;
  console.log(`${r.date}\t${r.name}\t${r.amount.toLocaleString('ru-RU')}\t${r.group}`);
}
console.log('---');
console.log('Пропущено строк за июль:', skipped.length, 'сумма:', sum.toLocaleString('ru-RU'));
process.exit(0);
