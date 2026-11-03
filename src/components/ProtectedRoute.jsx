import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useRole } from '../hooks/useRole.js';
import { Skeleton } from './ui/Skeleton.jsx';
import { CUSTOM_SECTION_ROLES, SECTION_OPTIONS } from '../lib/roles.js';

/**
 * Гард маршрута: нет пользователя / нет staff-документа / staff неактивен /
 * роль не входит в разрешённые → редирект на /login. Там же LoginPage
 * показывает точную причину блокировки.
 * @param {Object} props
 * @param {import('../types.js').Role[]} [props.allow] если указан — доступ только этим ролям
 * @param {string} [props.section] ключ раздела (Sidebar.ITEMS) — проверяется у сотрудников с ручным списком разделов
 *   (test всегда; manager/admin/operator, если список задан в AddStaffModal): доступ, только если раздел в
 *   useRole().sectionKeys. У остальных ролей не проверяется (у них доступ по allow/роли). Ключ вне меню
 *   (например, 'reports') закрыт только для test. Прячет доступ с прямого захода по URL — та же UI-защита,
 *   что и меню (не Firestore rules).
 * @param {import('react').ReactNode} props.children
 */
export function ProtectedRoute({ allow, section, children }) {
  const { user, staff, loading } = useAuth();
  const { role, allowedSections, sectionKeys } = useRole();

  if (loading) {
    return (
      <div className="flex h-screen flex-col justify-center gap-3 p-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!user || !staff || !staff.isActive) {
    return <Navigate to="/login" replace />;
  }

  const hasCustomList = role === 'test' || (CUSTOM_SECTION_ROLES.includes(role) && allowedSections.length > 0);
  const isMenuSection = SECTION_OPTIONS.some((o) => o.value === section);
  // Раздел, вручную открытый сотруднику в AddStaffModal, перекрывает allow роли.
  const grantedBySection = hasCustomList && isMenuSection && sectionKeys.includes(section);

  if (allow && !allow.includes(role) && !grantedBySection) {
    return <Navigate to="/" replace />;
  }

  if (hasCustomList && section && (isMenuSection ? !sectionKeys.includes(section) : role === 'test')) {
    return <Navigate to="/" replace />;
  }

  return children;
}
