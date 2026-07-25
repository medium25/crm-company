/**
 * Шапка страницы-списка: заголовок, «Количество — N», действия справа.
 * @param {Object} props
 * @param {string} props.title
 * @param {number} [props.count]
 * @param {import('react').ReactNode} [props.actions]
 */
export function PageHeader({ title, count, actions }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div className="flex items-baseline gap-3">
        <h1 className="text-[34px] leading-[40px] text-text">{title}</h1>
        {typeof count === 'number' && (
          <span className="text-[15px] text-muted">Количество — {count}</span>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
