import { useNavigate } from 'react-router-dom';
import { useRole } from '../../hooks/useRole.js';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { formatMoney, formatPhone } from '../../lib/format.js';
import { MIN_FREEZE_BALANCE, MAX_FREEZES_PER_STUDENT, canFreezeStudent } from '../../lib/billing.js';

export const SORT_OPTIONS = [
  { value: 'name', label: 'По А-Я' },
  { value: 'balance', label: 'По балансу' },
  { value: 'addedAt', label: 'По дате добавления' },
];

/**
 * Имя студента в составе группы: номер, цветной кружок баланса (зелёный — не в долгу, красный — минус) или плашка
 * для пробного/замороженного; клик открывает карточку. Превью баланса при наведении — только не учителю (учитель
 * видит цвет, но не сумму). Без загруженного student кружок не рисуем — цвет не угадываем.
 * @param {Object} props
 * @param {number} props.index номер в списке
 * @param {Object} props.enrollment
 * @param {Object} [props.student]
 */
export function RosterStudentCell({ index, enrollment, student }) {
  const navigate = useNavigate();
  const { isTeacher } = useRole();
  const balance = student?.balance ?? 0;
  const isTrial = enrollment.status === 'trial';
  const isPaused = enrollment.status === 'paused';

  return (
    <div className="flex min-w-0 items-center gap-2 text-control text-text">
      <span className="w-5 shrink-0 text-right text-muted">{index}.</span>
      {isTrial || isPaused ? (
        <span className="min-w-0 flex-1 truncate">
          <button
            type="button"
            onClick={() => navigate(`/students/${enrollment.studentId}`)}
            className={`rounded-badge px-2 py-0.5 text-small font-bold hover:opacity-80 ${isPaused ? 'bg-present/15 text-present' : 'bg-chip text-text'}`}
            title={isPaused ? 'Заморожен' : 'Пробный урок'}
          >
            {enrollment.studentName}
          </button>
        </span>
      ) : (
        <span className="group/pv relative flex min-w-0 flex-1 items-center gap-2">
          {student && <span className={`h-2 w-2 shrink-0 rounded-full ${balance >= 0 ? 'bg-success' : 'bg-danger'}`} />}
          <button type="button" onClick={() => navigate(`/students/${enrollment.studentId}`)} className="min-w-0 flex-1 truncate text-left hover:text-link">
            {enrollment.studentName}
          </button>
          {student && !isTeacher && (
            <span className="pointer-events-none absolute left-4 top-full z-30 mt-1 hidden whitespace-nowrap rounded-row border border-border-strong bg-surface px-2.5 py-1.5 shadow-soft group-hover/pv:block group-focus-within/pv:block">
              <span className="block text-caption leading-tight text-muted">баланс</span>
              <span className={`block text-small font-bold leading-snug ${balance >= 0 ? 'text-success' : 'text-danger'}`}>
                {balance > 0 ? '+' : ''}
                {formatMoney(balance)}
              </span>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** Телефон студента — ссылка tel:. */
export function RosterPhone({ student }) {
  if (!student?.phone) return null;
  return (
    <a href={`tel:+${student.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-small text-link">
      {formatPhone(student.phone)}
    </a>
  );
}

/** Меню «⋮» студента: открыть карточку, активировать пробного, заморозить, перевести, убрать из группы. */
export function RosterMenuCell({ enrollment, student, onFreeze, onLeave, onActivate, onTransfer }) {
  const navigate = useNavigate();
  const isTrial = enrollment.status === 'trial';
  const isPaused = enrollment.status === 'paused';
  const canFreeze = canFreezeStudent(student);
  const freezeDisabledTitle =
    (student?.freezeCount ?? 0) >= MAX_FREEZES_PER_STUDENT
      ? `Лимит заморозок за весь срок обучения исчерпан (${MAX_FREEZES_PER_STUDENT} из ${MAX_FREEZES_PER_STUDENT})`
      : `Заморозка доступна при балансе от ${formatMoney(MIN_FREEZE_BALANCE)}`;

  return (
    <DropdownMenu
      items={[
        { label: 'Открыть карточку', onClick: () => navigate(`/students/${enrollment.studentId}`) },
        ...(isTrial ? [{ label: 'Активировать', onClick: () => onActivate(enrollment) }] : []),
        ...(isPaused
          ? []
          : [{ label: 'Заморозить', onClick: () => onFreeze(enrollment), disabled: !canFreeze, title: canFreeze ? undefined : freezeDisabledTitle }]),
        { label: 'Перевести в другую группу', onClick: () => onTransfer(enrollment) },
        { label: 'Убрать из группы', onClick: () => onLeave(enrollment), danger: true },
      ]}
    />
  );
}
