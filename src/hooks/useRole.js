import { useAuth } from './useAuth.js';
import { visibleSectionKeys } from '../lib/roles.js';

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
 *   sectionKeys: string[],
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
    isAdmin: role === 'ceo' || role === 'manager' || role === 'admin' || role === 'operator',
    isTeacher: role === 'teacher',
    isTest: role === 'test',
    // Вручную выбранные разделы меню (см. AddStaffModal): у test — единственный источник, у
    // manager/admin/operator — переопределяет набор по умолчанию, если не пуст.
    allowedSections: staff?.allowedSections ?? [],
    // Итоговый список разделов меню этого сотрудника (Sidebar, ProtectedRoute, HomeRoute).
    sectionKeys: visibleSectionKeys(role, staff?.allowedSections ?? []),
    hasRole: (...roles) => roles.includes(role),
  };
}
