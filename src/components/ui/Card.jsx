/**
 * Белая карточка: фон surface, радиус card (12px), тень card.
 * @param {Object} props
 * @param {boolean} [props.hoverable] добавляет тень hover при наведении
 */
export function Card({ hoverable = false, className = '', children, ...rest }) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-6 shadow-card ${hoverable ? 'transition-shadow hover:shadow-hover' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
