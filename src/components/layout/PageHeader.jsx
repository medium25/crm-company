/**
 * Шапка страницы-списка: заголовок, «Количество — N», действия справа. Без title
 * (главные экраны разделов) заголовка нет — остаются только действия справа, а без
 * действий не рисуется вовсе.
 * @param {Object} props
 * @param {string} [props.title]
 * @param {number} [props.count]
 * @param {import('react').ReactNode} [props.actions]
 */
export function PageHeader({ title, count, actions }) {
  if (!title && !actions) return null;
  return (
    <div className={`mb-6 flex items-center ${title ? 'justify-between' : 'justify-end'}`}>
      {title && (
        <div className="flex items-baseline gap-3">
          <h1 className="text-[34px] leading-[40px] text-text">{title}</h1>
          {typeof count === 'number' && (
            <span className="text-[15px] text-muted">Количество — {count}</span>
          )}
        </div>
      )}
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
