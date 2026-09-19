// src/lib/searchSource.js
import { useSyncExternalStore } from 'react';

/**
 * Реестр «что искать в этом разделе». Страница, у которой нужные данные УЖЕ
 * загружены (доска «Заявки», «Задачи», «Пробные»), регистрирует их сюда, а
 * поиск в шапке ищет по ним же — без собственной подписки на базу (то есть
 * без лишних чтений Firestore).
 *
 * source = { items: Array<Object>, lost?: { loaded, count, load } } —
 * `lost` только у «Заявок»: «Отказ» грузится по кнопке, поиск умеет
 * предложить догрузить его.
 */
const sources = {};
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function setSearchSource(kind, source) {
  sources[kind] = source;
  listeners.forEach((l) => l());
}

export function clearSearchSource(kind) {
  if (!(kind in sources)) return;
  delete sources[kind];
  listeners.forEach((l) => l());
}

export function useSearchSource(kind) {
  return useSyncExternalStore(subscribe, () => sources[kind]);
}
