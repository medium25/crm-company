// src/lib/firestoreMetered.js
import * as real from '@firebase/firestore';
import { recordReads } from './usageMeter.js';

/**
 * Замена 'firebase/firestore' (алиас в vite.config.js): всё то же самое, но
 * чтения, которые вернул сервер, считаются в usageMeter (раздел «Расход
 * Firebase» в настройках). Данные из локального кэша не тарифицируются и не
 * считаются. Сами вызовы работают как раньше.
 */
export * from '@firebase/firestore';

function countSnapshot(snap) {
  if (snap?.metadata?.fromCache) return;
  recordReads(typeof snap?.docChanges === 'function' ? snap.docChanges().length : 1);
}

export async function getDocs(...args) {
  const snap = await real.getDocs(...args);
  if (!snap.metadata.fromCache) recordReads(Math.max(snap.size, 1));
  return snap;
}

export async function getDoc(...args) {
  const snap = await real.getDoc(...args);
  if (!snap.metadata.fromCache) recordReads(1);
  return snap;
}

export async function getCountFromServer(...args) {
  const snap = await real.getCountFromServer(...args);
  recordReads(1); // считается по 1 чтению на каждые 1000 записей, минимум 1
  return snap;
}

/** Подписка: считаем изменения документов, пришедшие с сервера (первый снимок — весь результат). */
export function onSnapshot(ref, ...args) {
  let nextSeen = false;
  const wrapped = args.map((arg) => {
    if (typeof arg === 'function' && !nextSeen) {
      nextSeen = true;
      return (snap, ...rest) => {
        countSnapshot(snap);
        return arg(snap, ...rest);
      };
    }
    if (arg && typeof arg === 'object' && typeof arg.next === 'function') {
      return {
        ...arg,
        next: (snap, ...rest) => {
          countSnapshot(snap);
          return arg.next(snap, ...rest);
        },
      };
    }
    return arg;
  });
  return real.onSnapshot(ref, ...wrapped);
}
