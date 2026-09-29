const VARIANT_CLASSES = {
  primary: 'bg-navy text-white hover:bg-navy-hover',
  secondary: 'bg-white text-navy border border-navy hover:bg-orange-soft/40',
  ghost: 'bg-transparent text-muted hover:bg-surface-alt',
  danger: 'bg-white text-danger border border-danger hover:bg-danger/5',
};

const SIZE_CLASSES = {
  md: 'h-12 px-6 text-control',
  sm: 'h-9 px-4 text-small',
};

const ICON_SIZE_CLASSES = {
  md: 'h-12 w-12',
  sm: 'h-9 w-9',
};

const ICON_TONE_CLASSES = {
  navy: 'border-navy text-navy',
  danger: 'border-danger text-danger',
  warning: 'border-warning text-warning',
};

/**
 * @param {Object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'|'icon-round'} [props.variant]
 * @param {'md'|'sm'} [props.size] md — 48px (формы), sm — 36px (фильтры, таблицы, канбан)
 * @param {'navy'|'danger'|'warning'} [props.tone] цвет обводки, только для variant="icon-round"
 * @param {boolean} [props.loading]
 */
export function Button({
  variant = 'primary',
  size = 'md',
  tone = 'navy',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  if (variant === 'icon-round') {
    return (
      <button
        type="button"
        disabled={disabled || loading}
        className={`inline-flex ${ICON_SIZE_CLASSES[size]} items-center justify-center rounded-full border bg-white transition-shadow hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-50 ${ICON_TONE_CLASSES[tone]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-field font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
