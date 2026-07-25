import { useState } from 'react';
import { Search, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';

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
 */
export function Topbar({ branches = [], activeBranchId, onBranchChange, billingBanner }) {
  const { staff, logout } = useAuth();
  const { role } = useRole();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="flex h-16 items-center gap-4 border-b border-border bg-surface px-6">
      {branches.length > 1 && (
        <select
          value={activeBranchId}
          onChange={(e) => onBranchChange?.(e.target.value)}
          className="h-9 rounded-field border border-border-strong bg-white px-2 text-[13px] text-text"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        className="flex h-9 flex-1 max-w-md items-center gap-2 rounded-full border border-border-strong bg-white px-3 text-[13px] text-muted"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Поиск по студентам и группам</span>
        <kbd className="rounded bg-surface-alt px-1.5 py-0.5 text-[11px]">⌘K</kbd>
      </button>

      {billingBanner && <div className="flex-1">{billingBanner}</div>}

      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 text-[13px]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-[12px] font-bold text-white">
            {staff?.fullName?.[0] ?? '?'}
          </span>
          <span className="text-text">{staff?.fullName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted" />
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
