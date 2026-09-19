import { useSyncExternalStore } from 'react';

const STORAGE_KEY = 'icon-crm:sidebar-collapsed';
const listeners = new Set();

const read = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};
let collapsed = read();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Свёрнуто ли боковое меню — одно состояние на Sidebar и Topbar (поиск в шапке
 * начинается там, где кончается меню, и сдвигается вместе с ним).
 * @returns {[boolean, () => void]} [свёрнуто, переключить]
 */
export function useSidebarCollapsed() {
  const value = useSyncExternalStore(subscribe, () => collapsed);
  const toggle = () => {
    collapsed = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // без localStorage — состояние живёт до перезагрузки
    }
    listeners.forEach((l) => l());
  };
  return [value, toggle];
}
