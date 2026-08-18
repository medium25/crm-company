import { forwardRef } from 'react';
import { Calendar } from 'lucide-react';

/**
 * Обёртка над нативным input[type=date] — своя библиотека дат не подключается
 * (единственная разрешённая — date-fns, только для форматирования).
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 */
export const DatePicker = forwardRef(function DatePicker(
  { label, error, className = '', ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-[13px] text-muted">{label}</span>}
      <span className="relative flex items-center">
        <Calendar className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />
        <input
          ref={ref}
          type="date"
          onClick={(e) => e.currentTarget.showPicker?.()}
          onFocus={(e) => e.currentTarget.showPicker?.()}
          className={`date-input h-11 w-full rounded-field border bg-white pl-10 pr-3 text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-navy/15 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted ${
            error ? 'border-danger' : 'border-border-strong focus:border-navy'
          } ${className}`}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-[13px] text-danger">{error}</span>}
    </label>
  );
});
