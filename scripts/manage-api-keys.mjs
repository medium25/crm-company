/**
 * Создание/отзыв/список ключей внешнего API (приём лидов из Google Sheets
 * и т.п. — см. API.md). Хранится только sha256-хэш; сырое значение
 * показывается один раз при создании и больше нигде не сохраняется.
 *
 *   node --env-file=.env scripts/manage-api-keys.mjs create "Google Sheets" write
 *   node --env-file=.env scripts/manage-api-keys.mjs create "BI дашборд" read
 *   node --env-file=.env scripts/manage-api-keys.mjs list
 *   node --env-file=.env scripts/manage-api-keys.mjs revoke <id>
 *
 * scope: read | write | read-write.
 * Нужны те же переменные окружения, что и у остальных scripts/*.mjs:
 * VITE_FB_* (см. .env.example) + SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD
 * (существующий staff с ролью ceo/manager/admin — apiKeys/{id} пишут только
 * админы, см. firestore.rules).
 */
import { randomBytes, createHash } from 'node:crypto';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, updateDoc, getDocs, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.VITE_FB_API_KEY,
  authDomain: process.env.VITE_FB_AUTH_DOMAIN,
  projectId: process.env.VITE_FB_PROJECT_ID,
  storageBucket: process.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FB_APP_ID,
};

const SCOPES = ['read', 'write', 'read-write'];

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function usage() {
  console.log(
    'Использование:\n' +
      '  node --env-file=.env scripts/manage-api-keys.mjs create "<название интеграции>" <read|write|read-write>\n' +
      '  node --env-file=.env scripts/manage-api-keys.mjs list\n' +
      '  node --env-file=.env scripts/manage-api-keys.mjs revoke <id>',
  );
}

const [, , command, ...args] = process.argv;
if (!command || !['create', 'list', 'revoke'].includes(command)) {
  usage();
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_PASSWORD);

if (command === 'create') {
  const [name, scope] = args;
  if (!name || !SCOPES.includes(scope)) {
    console.error('Нужно название интеграции и scope (read|write|read-write).');
    usage();
    process.exit(1);
  }
  const rawKey = `sk_live_${randomBytes(24).toString('hex')}`;
  const ref = doc(collection(db, 'apiKeys'));
  await setDoc(ref, {
    name,
    scope,
    hash: sha256(rawKey),
    revoked: false,
    createdAt: serverTimestamp(),
    lastUsedAt: null,
  });
  console.log('Ключ создан. Сохрани значение ниже прямо сейчас — второй раз оно нигде не покажется:\n');
  console.log(`  id:    ${ref.id}`);
  console.log(`  name:  ${name}`);
  console.log(`  scope: ${scope}`);
  console.log(`  key:   ${rawKey}`);
} else if (command === 'list') {
  const snap = await getDocs(collection(db, 'apiKeys'));
  if (snap.empty) {
    console.log('Ключей пока нет.');
  } else {
    for (const d of snap.docs) {
      const k = d.data();
      console.log(
        `${d.id}  ${k.revoked ? '[revoked]' : '[active] '}  ${k.scope.padEnd(11)}  ${k.name}` +
          (k.lastUsedAt ? `  last used ${k.lastUsedAt.toDate().toISOString()}` : '  never used'),
      );
    }
  }
} else if (command === 'revoke') {
  const [id] = args;
  if (!id) {
    usage();
    process.exit(1);
  }
  await updateDoc(doc(db, 'apiKeys', id), { revoked: true, revokedAt: serverTimestamp() });
  console.log(`Ключ ${id} отозван.`);
}

process.exit(0);
