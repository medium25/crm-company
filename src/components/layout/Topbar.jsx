import { useState } from 'react';
import { ChevronDown, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';
import { GlobalSearch } from './GlobalSearch.jsx';

const ROLE_LABELS = {
  owner: 'Владелец',
  admin: 'Администратор',
  teacher: 'Учитель',
  accountant: 'Бухгалтер',
};

/**
 * @param {Object} props
 * @param {Array<{id: string, name: string}>} [props.branches] список филиалов пользователя, переключатель — если больше одного
 * @param {string} [props.activeBranchId]
 * @param {(id: string) => void} [props.onBranchChange]
 * @param {import('react').ReactNode} [props.billingBanner] баннер месячного начисления (логика — фаза 5)
 * @param {() => void} [props.onMenuClick] открыть выдвижное меню (кнопка-гамбургер, только < md)
 */
export function Topbar({ branches = [], activeBranchId, onBranchChange, billingBanner, onMenuClick }) {
  const { staff, logout } = useAuth();
  const { role } = useRole();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="flex h-16 items-center gap-2 border-b border-border bg-surface px-3 sm:gap-4 sm:px-6">
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

      <GlobalSearch />

      {billingBanner && <div className="hidden flex-1 md:block">{billingBanner}</div>}

      <div className="relative ml-auto shrink-0">
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-border-strong px-2 py-1.5 text-[13px] sm:px-3"
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
