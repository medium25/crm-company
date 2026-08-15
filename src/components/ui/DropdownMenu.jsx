import { useEffect, useRef, useState } from 'react';
import { MoreVertical, ChevronDown } from 'lucide-react';

/**
 * Меню ⋮ в строках таблиц и карточках (Учителя, Группы, Студенты). Триггер
 * по умолчанию — круглая кнопка с ⋮; для сплит-кнопок (карточка студента)
 * передаётся `variant="chevron"` — узкая стрелка ▾, встраиваемая вплотную
 * к основной кнопке в общую пилюлю. Для триггеров с другим смыслом (не
 * "ещё действия", а конкретное действие вроде "перенести") — `icon` и
 * `ariaLabel` переопределяют иконку/подпись, оставляя тот же контейнер и
 * поведение (клик вне — закрыть, Escape — закрыть).
 * @param {Object} props
 * @param {Array<{label: string, onClick: () => void, danger?: boolean, disabled?: boolean, title?: string}>} props.items
 * @param {'icon'|'chevron'} [props.variant]
 * @param {import('react').ComponentType} [props.icon] переопределяет иконку триггера (по умолчанию MoreVertical/ChevronDown по variant)
 * @param {string} [props.ariaLabel] переопределяет aria-label триггера (по умолчанию «Действия»)
 */
export function DropdownMenu({ items, variant = 'icon', icon: Icon, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const TriggerIcon = Icon ?? (variant === 'chevron' ? ChevronDown : MoreVertical);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'chevron'
            ? 'flex h-11 w-9 items-center justify-center rounded-r-full border-l border-navy text-navy hover:bg-orange-soft/40'
            : 'flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt'
        }
        aria-label={ariaLabel ?? 'Действия'}
      >
        <TriggerIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-10 w-52 rounded-field border border-border bg-surface py-2 shadow-hover">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-2 text-left text-[15px] hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
                item.danger ? 'text-danger' : 'text-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
