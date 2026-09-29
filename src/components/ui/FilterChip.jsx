/**
 * Кнопка-чип фильтра (36px). Активная — navy.
 * @param {Object} props
 * @param {boolean} [props.active]
 * @param {() => void} [props.onClick]
 */
export function FilterChip({ active = false, onClick, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1.5 rounded-badge border px-4 text-small font-semibold transition-colors ${
        active
          ? 'border-navy bg-navy text-white'
          : 'border-border-strong bg-surface text-text hover:bg-surface-alt'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
