import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatPhone, formatDateTimeShort } from '../../lib/format.js';
import { surnameInitial } from './LeadCard.jsx';
import { secondLessonAt } from '../../lib/leadFunnel.js';

/**
 * Карточка лида на стадии «Пробный проведён» (студент уже создан на
 * «Пробные», ждёт оплаты) — 3 действия вместо операторского меню.
 * Просрочена (красная рамка + бейдж), если с начала времени «второго
 * урока» (trialDate + 2 дня, см. secondLessonAt) по карточке ничего не
 * сделали — она бы тогда так и осталась тут висеть.
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor]
 * @param {string} [props.operatorName]
 * @param {string} [props.teacherName]
 * @param {string} [props.groupCode]
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onPay
 * @param {(lead: Object) => void} props.onDeferPayment
 * @param {(lead: Object) => void} props.onArchive
 */
export function TrialCompletedCard({ lead, operatorColor, operatorName, teacherName, groupCode, onOpen, onPay, onDeferPayment, onArchive }) {
  const [expanded, setExpanded] = useState(false);
  const [operatorFirstName, operatorLastName] = (operatorName ?? '').trim().split(/\s+/);
  const operatorLabel = operatorFirstName
    ? `${operatorFirstName}${operatorLastName ? ` ${surnameInitial(operatorLastName)}.` : ''}`
    : '';

  const trialDateJs = lead.trialDate?.toDate?.();
  const overdue = trialDateJs ? Date.now() > secondLessonAt(trialDateJs).getTime() : false;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className={`flex min-h-[190px] cursor-pointer flex-col gap-2.5 rounded-xl border bg-surface p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        overdue ? 'border-danger ring-1 ring-danger/40' : 'border-border hover:border-navy/20'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
          {overdue && <span className="shrink-0 rounded-badge bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">Просрочено</span>}
        </div>
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>
      <span className="truncate text-[12px] text-muted">
        {teacherName ?? '—'} · {groupCode ?? '—'} · {trialDateJs ? formatDateTimeShort(lead.trialDate) : 'дата не указана'}
      </span>
      {operatorLabel && (
        <span
          className="w-fit truncate rounded-badge border bg-transparent px-1.5 py-0.5 text-[9px] font-bold"
          style={{ borderColor: `${operatorColor || '#8B94A3'}26`, color: operatorColor || '#8B94A3' }}
        >
          {operatorLabel}
        </span>
      )}
      <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          title="Продвинуть"
          className="flex items-center justify-center gap-1 truncate rounded-field border border-border-strong px-1.5 py-1 text-[11px] font-bold text-text hover:bg-surface-alt"
        >
          Продвинуть <ArrowRight className="h-3.5 w-3.5" />
        </button>
        {expanded && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPay(lead)}
              title="Оплата"
              className="min-w-0 flex-1 truncate rounded-field border border-success/40 px-1.5 py-1 text-[11px] font-bold text-success hover:bg-success/5"
            >
              Оплата
            </button>
            <button
              type="button"
              onClick={() => onDeferPayment(lead)}
              title="Перенос оплаты"
              className="min-w-0 flex-1 truncate rounded-field border border-navy/40 px-1.5 py-1 text-[11px] font-bold text-navy hover:bg-navy/5"
            >
              Перенос
            </button>
            <button
              type="button"
              onClick={() => onArchive(lead)}
              title="Архивировать"
              className="min-w-0 flex-1 truncate rounded-field border border-danger/40 px-1.5 py-1 text-[11px] font-bold text-danger hover:bg-danger/5"
            >
              Архив
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
