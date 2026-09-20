// src/lib/firestoreMetered.js
import * as real from '@firebase/firestore';
import { recordReads, recordWrites } from './usageMeter.js';

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

// --- Записи и удаления (лимиты Spark: по 20 000 в сутки) -----------------------------------------
// Считаем после успешного вызова: 1 документ = 1 запись/удаление. Батч и транзакция — по числу
// операций в них на момент commit.

export async function setDoc(...args) {
  const out = await real.setDoc(...args);
  recordWrites(1);
  return out;
}

export async function addDoc(...args) {
  const out = await real.addDoc(...args);
  recordWrites(1);
  return out;
}

export async function updateDoc(...args) {
  const out = await real.updateDoc(...args);
  recordWrites(1);
  return out;
}

export async function deleteDoc(...args) {
  const out = await real.deleteDoc(...args);
  recordWrites(0, 1);
  return out;
}

/** Оборачивает методы set/update/delete у batch/transaction — считает операции, отдаёт счётчик. */
function countOps(target) {
  const ops = { writes: 0, deletes: 0 };
  for (const name of ['set', 'update']) {
    const orig = target[name]?.bind(target);
    if (orig) target[name] = (...a) => ((ops.writes += 1), orig(...a));
  }
  const del = target.delete?.bind(target);
  if (del) target.delete = (...a) => ((ops.deletes += 1), del(...a));
  return ops;
}

export function writeBatch(...args) {
  const batch = real.writeBatch(...args);
  const ops = countOps(batch);
  const commit = batch.commit.bind(batch);
  batch.commit = async () => {
    const out = await commit();
    recordWrites(ops.writes, ops.deletes);
    return out;
  };
  return batch;
}

export function runTransaction(db, updateFunction, ...rest) {
  let ops = { writes: 0, deletes: 0 };
  return real
    .runTransaction(
      db,
      (tx) => {
        ops = countOps(tx); // при повторе транзакции счётчик пересоздаётся — считаем только успешную попытку
        return updateFunction(tx);
      },
      ...rest,
    )
    .then((out) => {
      recordWrites(ops.writes, ops.deletes);
      return out;
    });
}
