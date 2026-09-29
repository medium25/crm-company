const VARIANT_CLASSES = {
  'status-active': 'bg-success-bg text-success',
  'status-debt': 'bg-danger-bg text-white',
  'type-system': 'bg-chip text-muted',
  'type-payment': 'bg-success text-white',
  'group-code': 'bg-chip text-text tabular-nums',
  'attendance-present': 'bg-present text-white',
  'attendance-absent': 'bg-absent text-white',
  'attendance-present-muted': 'bg-muted text-white',
  'attendance-absent-muted': 'bg-border-strong text-muted',
};

/**
 * @param {Object} props
 * @param {keyof typeof VARIANT_CLASSES} props.variant
 */
export function Badge({ variant, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2.5 py-0.5 text-caption font-bold ${VARIANT_CLASSES[variant] ?? ''} ${className}`}
    >
      {children}
    </span>
  );
}
