/**
 * Загрузка — скелетон в форме контента, не спиннер по центру.
 * @param {Object} props
 * @param {string} [props.className] задаёт ширину/высоту/форму под конкретный контент
 */
export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded-field bg-border ${className}`} />;
}

/** Готовая заглушка строки таблицы-карточки. */
export function SkeletonRow({ columns = 4 }) {
  return (
    <div className="flex items-center gap-6 rounded-row bg-surface p-4 shadow-card">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}
