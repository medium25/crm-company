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
 * @param {import('react').ReactNode} props.children
 */
export function ProtectedRoute({ allow, children }) {
  const { user, staff, loading } = useAuth();
  const { role } = useRole();

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

  return children;
}
