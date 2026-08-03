import { useEffect, useRef, useState } from 'react';
import { MoreVertical, ChevronDown } from 'lucide-react';

/**
 * Меню ⋮ в строках таблиц и карточках (Учителя, Группы, Студенты). Триггер
 * по умолчанию — круглая кнопка с ⋮; для сплит-кнопок (карточка студента)
 * передаётся `variant="chevron"` — узкая стрелка ▾, встраиваемая вплотную
 * к основной кнопке в общую пилюлю.
 * @param {Object} props
 * @param {Array<{label: string, onClick: () => void, danger?: boolean}>} props.items
 * @param {'icon'|'chevron'} [props.variant]
 */
export function DropdownMenu({ items, variant = 'icon' }) {
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

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'chevron'
            ? 'flex h-11 w-9 items-center justify-center border-l border-navy text-navy hover:bg-orange-soft/40'
            : 'flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt'
        }
        aria-label="Действия"
      >
        {variant === 'chevron' ? <ChevronDown className="h-4 w-4" /> : <MoreVertical className="h-4 w-4" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-10 w-52 rounded-field border border-border bg-surface py-2 shadow-hover">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-2 text-left text-[15px] hover:bg-surface-alt ${
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
