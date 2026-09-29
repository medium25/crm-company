import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const SIZE_CLASSES = {
  md: 'h-12 text-control',
  sm: 'h-9 text-small',
};

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 * @param {'md'|'sm'} [props.size]
 * @param {import('react').ComponentType} [props.leftIcon]
 * @param {Array<{value: string, label: string}>} [props.options]
 */
export const Select = forwardRef(function Select(
  { label, error, size = 'md', leftIcon: LeftIcon, options, className = '', children, ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-small text-muted">{label}</span>}
      <span className="relative flex items-center">
        {LeftIcon && <LeftIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />}
        <select
          ref={ref}
          className={`${SIZE_CLASSES[size]} w-full appearance-none rounded-field border bg-white px-3 pr-9 text-text focus:outline-none focus:ring-2 focus:ring-navy/15 ${LeftIcon ? 'pl-9' : ''} ${
            error ? 'border-danger' : 'border-border-strong focus:border-navy'
          } ${className}`}
          {...rest}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" />
      </span>
      {error && <span className="mt-1 block text-small text-danger">{error}</span>}
    </label>
  );
});
