import { formatPhone } from '../../lib/format.js';
import { surnameInitial, trialScheduleLabel } from './LeadCard.jsx';

/**
 * Карточка лида на странице «Пробные» — только просмотр, без операторских
 * кнопок (дозвон/«не выходит на связь»/комментарии/меню). Единственное
 * действие — «Создать студента» (открывает «Добавить в группу», см.
 * TrialsPage), после чего лид у оператора на «Заявки» переходит в «Пробный
 * проведён».
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor]
 * @param {string} [props.operatorName]
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCreateStudent
 */
export function TrialLeadCard({ lead, operatorColor, operatorName, onOpen, onCreateStudent }) {
  const [operatorFirstName, operatorLastName] = (operatorName ?? '').trim().split(/\s+/);
  const operatorLabel = operatorFirstName
    ? `${operatorFirstName}${operatorLastName ? ` ${surnameInitial(operatorLastName)}.` : ''}`
    : '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className="flex min-h-[190px] cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-navy/20 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>
      <span className="truncate text-[12px] text-muted">{trialScheduleLabel(lead)}</span>
      <div className="mt-auto flex items-center justify-between border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
        {operatorLabel ? (
          <span
            className="truncate rounded-badge border bg-transparent px-1.5 py-0.5 text-[9px] font-bold"
            style={{ borderColor: `${operatorColor || '#8B94A3'}26`, color: operatorColor || '#8B94A3' }}
          >
            {operatorLabel}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onCreateStudent(lead)}
          className="rounded-field border border-border-strong px-2.5 py-1.5 text-[12px] font-bold text-text hover:bg-surface-alt"
        >
          Создать студента
        </button>
      </div>
    </div>
  );
}
