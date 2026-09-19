import { useState } from 'react';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';
import { useSidebarCollapsed } from '../../hooks/useSidebarCollapsed.js';
import { GlobalSearch } from './GlobalSearch.jsx';
import iconMark from '../../../public/icon-mark.png';
import iconWordmark from '../../../public/icon-wordmark.png';

const ROLE_LABELS = {
  ceo: 'CEO',
  manager: 'Менеджер',
  admin: 'Администратор',
  teacher: 'Учитель',
  test: 'Тестовый сотрудник',
};

/**
 * @param {Object} props
 * @param {Array<{id: string, name: string}>} [props.branches] список филиалов пользователя, переключатель — если больше одного
 * @param {string} [props.activeBranchId]
 * @param {(id: string) => void} [props.onBranchChange]
 * @param {() => void} [props.onMenuClick] открыть выдвижное меню (кнопка-гамбургер, только < md)
 */
export function Topbar({ branches = [], activeBranchId, onBranchChange, onMenuClick }) {
  const { staff, logout } = useAuth();
  const { role } = useRole();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed] = useSidebarCollapsed();

  return (
    <header className="relative flex h-16 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-4 sm:px-6 md:pl-0">
      <button
        type="button"
        onClick={onMenuClick}
        className="shrink-0 rounded-field p-2 text-muted hover:bg-surface-alt md:hidden"
        aria-label="Открыть меню"
      >
        <Menu className="h-5 w-5" />
      </button>

      {branches.length > 1 && (
        <select
          value={activeBranchId}
          onChange={(e) => onBranchChange?.(e.target.value)}
          className="hidden h-9 shrink-0 rounded-field border border-border-strong bg-white px-2 text-[13px] text-text sm:block"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {/* Логотип — в левом углу шапки, в такой же рамке, как поиск и профиль (в узком меню — только знак).
          Ширина блока — меню + отступ страницы минус промежуток flex (1rem). */}
      <div className={`hidden shrink-0 items-center pl-2.5 transition-[width] md:flex ${sidebarCollapsed ? 'w-[4.5rem]' : 'w-[7.5rem]'}`}>
        <div className="flex h-9 items-center gap-1.5 rounded-field border border-border-strong bg-white px-3">
          <img src={iconMark} alt="ICON" className="h-5 w-5 shrink-0" />
          {!sidebarCollapsed && <img src={iconWordmark} alt="" className="h-3.5 w-auto shrink-0" />}
        </div>
      </div>
      {/* Поиск — по центру шапки, 16rem (было 20rem, −20%); на телефоне остаётся в потоке слева. */}
      <div className="flex min-w-0 flex-1 sm:absolute sm:left-1/2 sm:top-1/2 sm:w-64 sm:flex-none sm:-translate-x-1/2 sm:-translate-y-1/2">
        <GlobalSearch />
      </div>

      <div className="relative ml-auto shrink-0">
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          className="flex items-center gap-2 rounded-field border border-border-strong px-2 py-1.5 text-[13px] sm:px-3"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white">
            {staff?.fullName?.[0] ?? '?'}
          </span>
          <span className="hidden text-text sm:inline">{staff?.fullName}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </button>
        {profileOpen && (
          <div className="absolute right-0 top-11 w-48 rounded-field border border-border bg-surface py-2 shadow-hover">
            <div className="px-3 pb-2 text-[13px] text-muted">{ROLE_LABELS[role] ?? role}</div>
            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[15px] text-text hover:bg-surface-alt"
            >
              <LogOut className="h-4 w-4" /> Выход
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
