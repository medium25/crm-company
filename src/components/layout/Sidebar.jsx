import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  UserPlus,
  CircleUserRound,
  Layers,
  GraduationCap,
  Coins,
  BarChart3,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useRole } from '../../hooks/useRole.js';

const STORAGE_KEY = 'icon-crm:sidebar-collapsed';

/**
 * Полный список пунктов меню. Видимость по роли — см. ROLE_ITEM_KEYS ниже.
 * Учитель — частный случай: только «Группы» и «Дашборд учителя» (04 · Экраны, «Оболочка приложения»).
 */
const ITEMS = [
  { key: 'dashboard', to: '/', label: 'Дашборд', icon: LayoutGrid },
  { key: 'leads', to: '/leads', label: 'Лиды', icon: UserPlus, badgeKey: 'leads' },
  { key: 'students', to: '/students', label: 'Студенты', icon: CircleUserRound },
  { key: 'groups', to: '/groups', label: 'Группы', icon: Layers },
  { key: 'teachers', to: '/teachers', label: 'Учителя', icon: GraduationCap },
  { key: 'payments', to: '/payments', label: 'Финансы', icon: Coins },
  { key: 'reports', to: '/reports', label: 'Отчёты', icon: BarChart3 },
  { key: 'settings', to: '/settings', label: 'Настройки', icon: Settings },
];

/** [достроено] грубая матрица видимости пунктов меню по роли, уточняется по ходу фаз 1-8. */
const ROLE_ITEM_KEYS = {
  owner: ['dashboard', 'leads', 'students', 'groups', 'teachers', 'payments', 'reports', 'settings'],
  admin: ['dashboard', 'leads', 'students', 'groups', 'teachers', 'payments', 'reports'],
  accountant: ['dashboard', 'students', 'payments', 'reports'],
  teacher: ['dashboard', 'groups'],
};

/**
 * @param {Object} props
 * @param {number} [props.leadsCount] живой счётчик у пункта «Лиды»
 */
export function Sidebar({ leadsCount }) {
  const { role, isTeacher } = useRole();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const visibleKeys = ROLE_ITEM_KEYS[role] ?? [];
  const items = ITEMS.filter((item) => visibleKeys.includes(item.key));

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex h-16 items-center justify-center border-b border-border px-4 text-lg font-extrabold text-navy">
        {collapsed ? 'IC' : 'ICON'}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {items.map((item) => {
          const Icon = item.icon;
          const label = isTeacher && item.key === 'dashboard' ? 'Дашборд учителя' : item.label;
          const badge = item.badgeKey === 'leads' ? leadsCount : undefined;
          return (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `mx-2 mb-1 flex items-center gap-3 rounded-field px-3 py-2.5 text-[15px] transition-colors ${
                  isActive ? 'bg-navy text-white' : 'text-text hover:bg-surface-alt'
                }`
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
              {!collapsed && Boolean(badge) && (
                <span className="rounded-full bg-orange px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={toggle}
        className="flex h-12 items-center justify-center border-t border-border text-muted hover:bg-surface-alt"
        aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>
    </aside>
  );
}
