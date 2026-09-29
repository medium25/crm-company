import { forwardRef } from 'react';

const SIZE_CLASSES = {
  md: 'h-12 text-control',
  sm: 'h-9 text-small',
};

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 * @param {'md'|'sm'} [props.size]
 * @param {import('react').ComponentType} [props.leftIcon] иконка из lucide-react
 */
export const Input = forwardRef(function Input(
  { label, error, size = 'md', leftIcon: LeftIcon, className = '', ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-small text-muted">{label}</span>}
      <span className="relative flex items-center">
        {LeftIcon && <LeftIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />}
        <input
          ref={ref}
          onWheel={rest.type === 'number' ? (e) => e.currentTarget.blur() : undefined}
          className={`${SIZE_CLASSES[size]} w-full rounded-field border bg-white px-3 text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-navy/15 ${LeftIcon ? 'pl-9' : ''} ${
            error ? 'border-danger' : 'border-border-strong focus:border-navy'
          } ${className}`}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-small text-danger">{error}</span>}
    </label>
  );
});
