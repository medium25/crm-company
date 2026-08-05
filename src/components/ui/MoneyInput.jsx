import { forwardRef } from 'react';
import { Input } from './Input.jsx';

function groupDigits(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Текстовое поле суммы с разделением разрядов пробелами при вводе.
 * value/onChange работают с сырой строкой цифр (без пробелов), как у обычного number-инпута.
 */
export const MoneyInput = forwardRef(function MoneyInput({ value, onChange, ...rest }, ref) {
  const digits = (value ?? '').replace(/\D/g, '');

  const handleChange = (e) => {
    onChange({ target: { value: e.target.value.replace(/\D/g, '') } });
  };

  return (
    <Input
      ref={ref}
      inputMode="numeric"
      value={groupDigits(digits)}
      onChange={handleChange}
      {...rest}
      type="text"
    />
  );
});
