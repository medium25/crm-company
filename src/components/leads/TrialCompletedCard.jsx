import { formatPhone } from '../../lib/format.js';
import { surnameInitial, trialScheduleLabel } from './LeadCard.jsx';

/**
 * Карточка лида на стадии «Пробный проведён» (студент уже создан на
 * «Пробные», ждёт оплаты) — 3 действия вместо операторского меню.
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor]
 * @param {string} [props.operatorName]
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onPay
 * @param {(lead: Object) => void} props.onDeferPayment
 * @param {(lead: Object) => void} props.onArchive
 */
export function TrialCompletedCard({ lead, operatorColor, operatorName, onOpen, onPay, onDeferPayment, onArchive }) {
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
      className="flex cursor-pointer flex-col gap-1.5 rounded-xl border border-border bg-surface p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-navy/20 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>
      <span className="truncate text-[12px] text-muted">{trialScheduleLabel(lead)}</span>
      {operatorLabel && (
        <span
          className="w-fit truncate rounded-badge border bg-transparent px-1.5 py-0.5 text-[9px] font-bold"
          style={{ borderColor: operatorColor || '#8B94A3', color: operatorColor || '#8B94A3' }}
        >
          {operatorLabel}
        </span>
      )}
      <div className="flex flex-wrap gap-1.5 border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onPay(lead)}
          className="rounded-field bg-success px-2 py-1 text-[11px] font-bold text-white hover:opacity-90"
        >
          Оплата
        </button>
        <button
          type="button"
          onClick={() => onDeferPayment(lead)}
          className="rounded-field border border-border px-2 py-1 text-[11px] font-bold text-text hover:bg-surface-alt"
        >
          Перенос оплаты
        </button>
        <button
          type="button"
          onClick={() => onArchive(lead)}
          className="rounded-field border border-border px-2 py-1 text-[11px] font-bold text-danger hover:bg-danger/5"
        >
          Архивировать
        </button>
      </div>
    </div>
  );
}
