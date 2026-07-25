import { useEffect, useRef, useState } from 'react';
import { Settings2 } from 'lucide-react';

/**
 * «⚙ Колонки» — попап выбора видимых колонок таблицы, сохраняется в localStorage.
 * @param {Object} props
 * @param {Array<{key: string, label: string}>} props.columns все колонки
 * @param {string[]} props.visible ключи видимых колонок
 * @param {(next: string[]) => void} props.onChange
 */
export function ColumnsPopover({ columns, visible, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const toggle = (key) => {
    onChange(visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 items-center gap-2 rounded-field border border-border-strong px-3 text-[15px] text-text hover:bg-surface-alt"
      >
        <Settings2 className="h-4 w-4" /> Колонки
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-10 w-56 rounded-field border border-border bg-surface p-2 shadow-hover">
          {columns.map((col) => (
            <label
              key={col.key}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-[15px] text-text hover:bg-surface-alt"
            >
              <input type="checkbox" checked={visible.includes(col.key)} onChange={() => toggle(col.key)} />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
