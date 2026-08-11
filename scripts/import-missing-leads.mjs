/**
 * Бэкафилл лидов, потерянных при миграции: старая система (icon.modme.uz,
 * branch_id=681) показывает 22 активных лида (группа "ASOSIY" на канбане
 * /leads), в новой Firestore на момент проверки было всего 5 — 17 карточек
 * никогда не были перенесены.
 *
 * Источник: снято 10.08.2026 через API modme из авторизованной вкладки
 * браузера (GET /v1/leadSection?branch_id=681&sections_id[]=<id> для каждой
 * непустой секции группы ASOSIY) — записано в old_leads.json рядом со
 * скриптом.
 *
 * Сверка по номеру телефона (только цифры) против ВСЕХ студентов филиала
 * (не только текущих лидов) — если номер уже существует в любом статусе,
 * значит карточка не потеряна, а перешла в другое состояние (пробный,
 * активный и т.п.), пропускаем.
 *
 *   node --env-file=.env scripts/import-missing-leads.mjs           # dry-run
 *   node --env-file=.env scripts/import-missing-leads.mjs --apply
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';

const APPLY = process.argv.includes('--apply');
const BRANCH_ID = 'icon-main';
const __dirname = dirname(fileURLToPath(import.meta.url));

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const OLD_LEADS = JSON.parse(
  readFileSync(
    '/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/682c14fc-d11d-4a74-8098-1a63f17ed1e6/scratchpad/old_leads.json',
    'utf8',
  ),
);

// Секция канбана старой системы -> leadStage новой (03 · Бизнес-логика §5).
const SECTION_TO_STAGE = {
  '🔲 Yangi lidlar': 'today',
  '📌 Yozilganlar': 'today',
  'Jarayon (3 kungacha)': 'next_week',
  'keyingi oydan keladi': 'later',
};

const onlyDigits = (s) => (s || '').replace(/\D/g, '');

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const { user } = await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);
  console.log('Авторизован как', user.uid, APPLY ? '[APPLY]' : '[dry-run]');

  const studentsSnap = await getDocs(collection(db, 'students'));
  const existingPhones = new Set();
  studentsSnap.forEach((d) => {
    const s = d.data();
    if (s.phone) existingPhones.add(onlyDigits(s.phone));
    if (s.phone2) existingPhones.add(onlyDigits(s.phone2));
  });

  const toInsert = [];
  const skippedExisting = [];
  for (const lead of OLD_LEADS) {
    const phone = onlyDigits(lead.phone);
    if (existingPhones.has(phone)) {
      skippedExisting.push(lead);
    } else {
      toInsert.push(lead);
    }
  }

  console.log(`\nВсего лидов в старой системе (ASOSIY): ${OLD_LEADS.length}`);
  console.log(`Уже есть в новой (по телефону, любой статус): ${skippedExisting.length}`);
  skippedExisting.forEach((l) => console.log(`  = ${l.name} ${l.phone}`));
  console.log(`К добавлению: ${toInsert.length}`);
  toInsert.forEach((l) => console.log(`  + ${l.name} ${l.phone} [${l.section}] -> leadStage=${SECTION_TO_STAGE[l.section]}`));

  if (!APPLY) {
    console.log('\ndry-run. Проверь список и запусти с --apply.');
    process.exit(0);
  }

  for (const lead of toInsert) {
    const leadStage = SECTION_TO_STAGE[lead.section] ?? 'today';
    // eslint-disable-next-line no-await-in-loop
    await addDoc(collection(db, 'students'), {
      fullName: lead.name.trim(),
      phone: onlyDigits(lead.phone),
      phone2: null,
      source: null,
      branchId: BRANCH_ID,
      publicId: Math.floor(1000000 + Math.random() * 9000000),
      birthDate: null,
      gender: null,
      photoUrl: null,
      status: 'lead',
      statusReason: null,
      leadStage,
      leadResult: null,
      balance: 0,
      balanceUpdatedAt: serverTimestamp(),
      note: lead.comment ?? '',
      isFlagged: false,
      activeGroupsCount: 0,
      firstPaymentAt: null,
      lastPaymentAt: null,
      trialAt: null,
      leftAt: null,
      createdAt: Timestamp.fromDate(new Date(lead.created_at)),
      createdBy: user.uid,
      isArchived: false,
    });
    console.log(`Добавлен: ${lead.name} ${lead.phone}`);
  }
  console.log('\nГотово.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
