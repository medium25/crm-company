import { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Inbox,
  CalendarCheck,
  CircleUserRound,
  GraduationCap,
  Coins,
  BarChart3,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  X,
} from 'lucide-react';
import { useRole } from '../../hooks/useRole.js';
import iconMark from '../../../public/icon-mark.png';
import iconWordmark from '../../../public/icon-wordmark.png';

const STORAGE_KEY = 'icon-crm:sidebar-collapsed';

/**
 * Полный список пунктов меню. Видимость по роли — см. ROLE_ITEM_KEYS ниже.
 * «Группы» и «Учителя» объединены в один пункт «Учителя и группы» —
 * список учителей, клик по учителю открывает его группы (TeachersAndGroupsPage).
 * Учитель — частный случай: видит только «Учителя и группы» (04 · Экраны, «Оболочка приложения»).
 */
const ITEMS = [
  { key: 'dashboard', to: '/', label: 'Дашборд', icon: LayoutGrid },
  { key: 'leads', to: '/leads', label: 'Заявки', icon: Inbox },
  { key: 'trials', to: '/trials', label: 'Пробные', icon: CalendarCheck },
  { key: 'students', to: '/students', label: 'Студенты', icon: CircleUserRound },
  { key: 'teachersGroups', to: '/teachers-groups', label: 'Учителя и группы', icon: GraduationCap },
  { key: 'payments', to: '/payments', label: 'Финансы', icon: Coins },
  { key: 'reports', to: '/reports', label: 'Отчёты', icon: BarChart3 },
  { key: 'settings', to: '/settings', label: 'Настройки', icon: Settings },
];

/** ceo/manager/admin — полный доступ, teacher — только «Учителя и группы» (те же группы, что раньше). */
const ROLE_ITEM_KEYS = {
  ceo: ['dashboard', 'leads', 'trials', 'students', 'teachersGroups', 'payments', 'reports', 'settings'],
  manager: ['dashboard', 'leads', 'trials', 'students', 'teachersGroups', 'payments', 'reports', 'settings'],
  admin: ['dashboard', 'leads', 'trials', 'students', 'teachersGroups', 'payments', 'reports', 'settings'],
  teacher: ['teachersGroups'],
};

/**
 * @param {Object} props
 * @param {number} [props.leadsCount] живой счётчик у пункта «Лиды»
 * @param {boolean} [props.mobileOpen] выдвижное меню открыто (< md, кнопка-гамбургер в Topbar)
 * @param {() => void} [props.onMobileClose]
 */
export function Sidebar({ leadsCount, mobileOpen = false, onMobileClose }) {
  const { role } = useRole();
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
    <>
      <aside
        className={`hidden h-full shrink-0 flex-col bg-surface transition-[width] md:flex ${
          collapsed ? 'w-16' : 'w-28'
        }`}
      >
        <div className="flex h-16 items-center justify-center gap-2 px-3">
          <img src={iconMark} alt="" className="h-5 w-5 shrink-0" />
          {!collapsed && <img src={iconWordmark} alt="ICON" className="h-4 w-auto shrink-0" />}
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const badge = item.badgeKey === 'leads' ? leadsCount : undefined;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `group relative flex flex-col items-center gap-1.5 border-l-[3px] py-3.5 text-center text-[13px] leading-tight transition-colors ${
                    collapsed ? 'px-2' : 'px-3'
                  } ${
                    isActive
                      ? 'border-l-navy bg-orange-soft/40 font-bold text-navy'
                      : 'border-l-transparent text-muted hover:bg-surface-alt hover:text-text'
                  }`
                }
              >
                <span className="relative">
                  <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                  {Boolean(badge) && (
                    <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[10px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </span>
                {!collapsed && <span>{item.label}</span>}
                {collapsed && (
                  <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-field bg-navy px-2.5 py-1.5 text-[13px] font-normal text-white opacity-0 shadow-hover transition-opacity group-hover:opacity-100">
                    {item.label}
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

      {mobileOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="absolute inset-0 bg-[rgba(16,24,40,.45)]" onClick={onMobileClose} />
            <nav className="relative flex h-full w-64 max-w-[80vw] flex-col bg-surface shadow-modal">
              <div className="flex h-16 items-center justify-between border-b border-border px-4">
                <span className="flex items-center gap-2">
                  <img src={iconMark} alt="" className="h-5 w-5 shrink-0" />
                  <img src={iconWordmark} alt="ICON" className="h-4 w-auto shrink-0" />
                </span>
                <button type="button" onClick={onMobileClose} className="rounded-full p-1 text-muted hover:bg-surface-alt" aria-label="Закрыть меню">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto py-2">
                {items.map((item) => {
                  const Icon = item.icon;
                  const badge = item.badgeKey === 'leads' ? leadsCount : undefined;
                  return (
                    <NavLink
                      key={item.key}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={onMobileClose}
                      className={({ isActive }) =>
                        `flex items-center gap-3 border-l-[3px] px-4 py-3.5 text-[15px] transition-colors ${
                          isActive
                            ? 'border-l-navy bg-orange-soft/40 font-bold text-navy'
                            : 'border-l-transparent text-muted hover:bg-surface-alt hover:text-text'
                        }`
                      }
                    >
                      <span className="relative">
                        <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                        {Boolean(badge) && (
                          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[10px] font-bold text-white">
                            {badge}
                          </span>
                        )}
                      </span>
                      {item.label}
                    </NavLink>
                  );
                })}
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
