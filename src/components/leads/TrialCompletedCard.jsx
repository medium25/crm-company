import { Wallet, Clock, Archive } from 'lucide-react';
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
      <div className="flex items-center gap-0.5 border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onPay(lead)}
          aria-label="Добавить оплату"
          title="Добавить оплату"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-success"
        >
          <Wallet className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDeferPayment(lead)}
          aria-label="Перенос оплаты"
          title="Перенос оплаты (в «Дожим»)"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-navy"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onArchive(lead)}
          aria-label="Архивировать"
          title="Архивировать"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-danger"
        >
          <Archive className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
