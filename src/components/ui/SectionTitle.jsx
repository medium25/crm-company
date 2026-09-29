/**
 * Заголовок блока (title) с приглушённой подписью рядом.
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.hint] «· 40 оплат», «за сентябрь»
 * @param {string} [props.className]
 */
export function SectionTitle({ title, hint, className = 'mb-3' }) {
  return (
    <p className={`text-title font-bold text-text ${className}`}>
      {title}
      {hint && <span className="ml-2 text-small font-normal text-muted">{hint}</span>}
    </p>
  );
}
