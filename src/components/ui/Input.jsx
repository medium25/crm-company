import { forwardRef } from 'react';

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 * @param {import('react').ComponentType} [props.leftIcon] иконка из lucide-react
 */
export const Input = forwardRef(function Input(
  { label, error, leftIcon: LeftIcon, className = '', ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[13px] text-muted">{label}</span>}
      <span className="relative flex items-center">
        {LeftIcon && <LeftIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />}
        <input
          ref={ref}
          onWheel={rest.type === 'number' ? (e) => e.currentTarget.blur() : undefined}
          className={`h-11 w-full rounded-field border bg-white px-3 text-[15px] text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-navy/15 ${LeftIcon ? 'pl-9' : ''} ${
            error ? 'border-danger' : 'border-border-strong focus:border-navy'
          } ${className}`}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-[13px] text-danger">{error}</span>}
    </label>
  );
});
