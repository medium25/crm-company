import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

/**
 * Список строк-карточек, а не классическая таблица (по 05 · Дизайн-система).
 * Состояния loading/error/empty обрабатывает вызывающая страница — Table
 * рендерит только данные, которые ей передали.
 * @param {Object} props
 * @param {Array<{key: string, label: string, sortable?: boolean, render?: (row: Object, index: number) => import('react').ReactNode}>} props.columns
 * @param {Array<Object>} props.rows каждая строка обязана иметь `id`
 * @param {string} [props.sortKey]
 * @param {'asc'|'desc'} [props.sortDir]
 * @param {(key: string) => void} [props.onSort]
 * @param {(row: Object) => void} [props.onRowClick]
 */
export function Table({ columns, rows, sortKey, sortDir = 'asc', onSort, onRowClick }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="grid min-w-max grid-flow-col-dense" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}>
        {columns.map((col) => {
          const active = col.key === sortKey;
          const Icon = active ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
          return (
            <button
              key={col.key}
              type="button"
              disabled={!col.sortable}
              onClick={() => col.sortable && onSort?.(col.key)}
              className={`flex items-center gap-1 px-5 py-2 text-left text-[15px] font-bold ${
                col.sortable ? 'cursor-pointer' : 'cursor-default'
              } ${active ? 'text-navy' : 'text-text'}`}
            >
              {col.label}
              {col.sortable && <Icon className={`h-3.5 w-3.5 ${active ? 'text-navy' : 'text-muted'}`} />}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {rows.map((row, index) => (
          <div
            key={row.id}
            onClick={() => onRowClick?.(row)}
            className={`grid min-w-max items-center rounded-row bg-surface px-5 py-4 shadow-card transition-shadow hover:bg-surface-alt hover:shadow-hover ${
              onRowClick ? 'cursor-pointer' : ''
            }`}
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(120px, 1fr))` }}
          >
            {columns.map((col) => (
              <div key={col.key} className="px-0 text-[15px] text-text">
                {col.render ? col.render(row, index) : row[col.key]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
