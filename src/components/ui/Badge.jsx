const VARIANT_CLASSES = {
  'status-active': 'bg-success-bg text-success',
  'status-debt': 'bg-danger-bg text-white rounded-full',
  'type-system': 'bg-[#EEF0F3] text-muted',
  'type-payment': 'bg-success text-white',
  'group-code': 'bg-[#EEF0F3] text-text tabular-nums',
  'attendance-present': 'bg-present text-white',
  'attendance-absent': 'bg-absent text-white',
};

/**
 * @param {Object} props
 * @param {keyof typeof VARIANT_CLASSES} props.variant
 */
export function Badge({ variant, className = '', children }) {
  const roundedClass = variant === 'status-debt' ? '' : 'rounded-badge';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-bold ${roundedClass} ${VARIANT_CLASSES[variant] ?? ''} ${className}`}
    >
      {children}
    </span>
  );
}
