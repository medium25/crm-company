import { useAuth } from './useAuth.js';

/**
 * Права читаются и здесь (UI), и в Firestore Rules — UI-проверка не защита,
 * а только скрытие недоступных действий.
 * @returns {{
 *   role: import('../types.js').Role|null,
 *   branchIds: string[],
 *   isOwner: boolean,
 *   isAdmin: boolean,
 *   isTeacher: boolean,
 *   isFinance: boolean,
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
    isOwner: role === 'owner',
    isAdmin: role === 'owner' || role === 'admin',
    isTeacher: role === 'teacher',
    isFinance: role === 'owner' || role === 'accountant',
    hasRole: (...roles) => roles.includes(role),
  };
}
