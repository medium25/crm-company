import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

/**
 * Список строк-карточек, а не классическая таблица (по 05 · Дизайн-система).
 * Состояния loading/error/empty обрабатывает вызывающая страница — Table
 * рендерит только данные, которые ей передали.
 * @param {Object} props
 * @param {Array<{key: string, label: string, sortable?: boolean, width?: string, render?: (row: Object, index: number) => import('react').ReactNode}>} props.columns
 *   `width` — фиксированная ширина колонки (CSS-значение, напр. "48px") вместо растяжимой `minmax(120px, 1fr)`, для узких колонок вроде чекбокса/номера строки
 * @param {Array<Object>} props.rows каждая строка обязана иметь `id`
 * @param {string} [props.sortKey]
 * @param {'asc'|'desc'} [props.sortDir]
 * @param {(key: string) => void} [props.onSort]
 * @param {(row: Object) => void} [props.onRowClick]
 */
export function Table({ columns, rows, sortKey, sortDir = 'asc', onSort, onRowClick }) {
  // Заголовок и строки — один общий grid-контейнер (а не отдельная сетка
  // на каждую строку): иначе строка с более длинным содержимым (например,
  // студент в 2+ группах) растягивает свои колонки независимо от соседних
  // строк, и всё расползается по вертикали.
  return (
    <div className="w-full overflow-x-auto">
      <div
        className="grid min-w-max gap-x-4 gap-y-2"
        style={{ gridTemplateColumns: columns.map((c) => c.width ?? 'minmax(120px, 1fr)').join(' ') }}
      >
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

        {rows.map((row, index) => (
          <div
            key={row.id}
            role="row"
            onClick={() => onRowClick?.(row)}
            className={`col-span-full grid grid-cols-subgrid items-center rounded-row bg-surface px-5 py-4 shadow-card transition-shadow hover:bg-surface-alt hover:shadow-hover ${
              onRowClick ? 'cursor-pointer' : ''
            }`}
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
