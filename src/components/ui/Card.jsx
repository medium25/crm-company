/**
 * Белая карточка: фон surface, светлая рамка, радиус card (16px), мягкая тень.
 * @param {Object} props
 * @param {boolean} [props.hoverable] добавляет тень hover при наведении
 */
export function Card({ hoverable = false, className = '', children, ...rest }) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-6 shadow-soft ${hoverable ? 'transition-shadow hover:shadow-hover' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
