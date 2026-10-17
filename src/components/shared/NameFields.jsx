import { Input } from '../ui/Input.jsx';

/**
 * Два поля «Имя» и «Фамилия» — в карточках и списках имя всегда идёт первым (см. joinName в lib/personName.js).
 * @param {Object} props
 * @param {string} props.firstName
 * @param {string} props.lastName
 * @param {(patch: {firstName?: string, lastName?: string}) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {boolean} [props.firstNameRequired] по умолчанию имя обязательно
 * @param {boolean} [props.lastNameRequired] по умолчанию фамилия необязательна (у лидов бывает только имя)
 */
export function NameFields({ firstName, lastName, onChange, disabled = false, firstNameRequired = true, lastNameRequired = false }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Input
        label="Имя"
        required={firstNameRequired}
        disabled={disabled}
        value={firstName}
        onChange={(e) => onChange({ firstName: e.target.value })}
      />
      <Input
        label="Фамилия"
        required={lastNameRequired}
        disabled={disabled}
        value={lastName}
        onChange={(e) => onChange({ lastName: e.target.value })}
      />
    </div>
  );
}
