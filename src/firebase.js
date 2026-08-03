import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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
export const db = safeInit(() => getFirestore(app), 'Firestore');
export const storage = safeInit(() => getStorage(app), 'Storage');
