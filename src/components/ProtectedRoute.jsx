import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useRole } from '../hooks/useRole.js';
import { Skeleton } from './ui/Skeleton.jsx';

/**
 * Гард маршрута: нет пользователя / нет staff-документа / staff неактивен /
 * роль не входит в разрешённые → редирект на /login. Там же LoginPage
 * показывает точную причину блокировки.
 * @param {Object} props
 * @param {import('../types.js').Role[]} [props.allow] если указан — доступ только этим ролям
 * @param {string} [props.section] ключ раздела (Sidebar.ITEMS) — для role === 'test' доступ только если
 *   раздел есть в staff.allowedSections; для остальных ролей не проверяется (у них доступ по allow/роли).
 *   Прячет доступ только с прямого захода по URL — та же UI-защита, что и остальные роли (не Firestore rules).
 * @param {import('react').ReactNode} props.children
 */
export function ProtectedRoute({ allow, section, children }) {
  const { user, staff, loading } = useAuth();
  const { role, isTest, allowedSections } = useRole();

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

  if (allow && !allow.includes(role)) {
    return <Navigate to="/" replace />;
  }

  if (isTest && section && !allowedSections.includes(section)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
