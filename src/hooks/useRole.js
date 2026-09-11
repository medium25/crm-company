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
 *   isTest: boolean,
 *   allowedSections: string[],
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
    isTest: role === 'test',
    // Только для role === 'test' — какие разделы меню ему вручную открыли
    // (см. AddStaffModal, Sidebar.ROLE_ITEM_KEYS). У остальных ролей пусто,
    // у них список разделов фиксирован по роли, не по сотруднику.
    allowedSections: staff?.allowedSections ?? [],
    hasRole: (...roles) => roles.includes(role),
  };
}
