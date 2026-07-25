import { X, Settings2 } from 'lucide-react';

/**
 * Контейнер строки фильтров. Состояние самих фильтров держит страница
 * (обычно через useSearchParams), FilterBar — только раскладка.
 * @param {Object} props
 * @param {import('react').ReactNode} props.children поля фильтров
 * @param {() => void} [props.onReset] показывает ✕ сброса всех фильтров
 * @param {() => void} [props.onMoreFilters] показывает «⚙ Фильтры»
 */
export function FilterBar({ children, onReset, onMoreFilters }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {children}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-11 w-11 items-center justify-center rounded-field border border-border-strong text-muted hover:bg-surface-alt"
          aria-label="Сбросить фильтры"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {onMoreFilters && (
        <button
          type="button"
          onClick={onMoreFilters}
          className="ml-auto flex h-11 items-center gap-2 rounded-field border border-border-strong px-3 text-[15px] text-text hover:bg-surface-alt"
        >
          <Settings2 className="h-4 w-4" /> Фильтры
        </button>
      )}
    </div>
  );
}
