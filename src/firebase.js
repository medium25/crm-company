import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initUsageMeter } from './lib/usageMeter.js';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);

function safeInit(factory, serviceName) {
  try {
    return factory();
  } catch {
    console.warn(
      `[firebase] ${serviceName} не инициализирован — заполни .env (VITE_FB_*) реальными ключами проекта.`,
    );
    return null;
  }
}

// Auth валидирует apiKey синхронно и кидает исключение при пустом .env — без
// safeInit это ронял бы весь модульный граф ещё до первого рендера React.
export const auth = safeInit(() => getAuth(app), 'Auth');

/**
 * Firestore с постоянным локальным кэшем (IndexedDB, общий для вкладок).
 * Главная экономия чтений: подписка на тот же запрос при переходе между
 * страницами, перезагрузке или повторном заходе (в пределах ~30 минут)
 * тарифицируется только за изменившиеся документы, а не за весь список
 * заново; данные из кэша при этом показываются мгновенно, а свежие
 * догружаются следом. Если IndexedDB недоступен (приватный режим, старый
 * браузер) или экземпляр уже создан (горячая перезагрузка в dev) —
 * обычный Firestore без кэша на диске, приложение работает как раньше.
 */
function createFirestore() {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    return getFirestore(app);
  }
}
export const db = safeInit(createFirestore, 'Firestore');
if (db) initUsageMeter(db);
export const storage = safeInit(() => getStorage(app), 'Storage');
