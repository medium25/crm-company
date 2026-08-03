import { useAuth } from './useAuth.js';

/**
 * Права читаются и здесь (UI), и в Firestore Rules — UI-проверка не защита,
 * а только скрытие недоступных действий. ceo/manager/admin — равнозначные
 * должности полного доступа, между собой ничем не различаются.
 * @returns {{
 *   role: import('../types.js').Role|null,
 *   branchIds: string[],
 *   isAdmin: boolean,
 *   isTeacher: boolean,
 *   hasRole: (...roles: import('../types.js').Role[]) => boolean,
 * }}
 */
export function useRole() {
  const { staff } = useAuth();
  const role = staff?.role ?? null;
  const branchIds = staff?.branchIds ?? [];

  return {
    role,
    branchIds,
    isAdmin: role === 'ceo' || role === 'manager' || role === 'admin',
    isTeacher: role === 'teacher',
    hasRole: (...roles) => roles.includes(role),
  };
}
