/**
 * Вложенная плитка внутри Card: фон страницы, без рамки, радиус row.
 * Прямо на фоне страницы не ставить (сольётся), там нужен Card/StatCard.
 */
export function Tile({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-row bg-bg p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
