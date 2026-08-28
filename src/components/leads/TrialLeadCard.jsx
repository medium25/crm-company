import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { formatPhone, formatDateTimeShort, formatSource } from '../../lib/format.js';
import { operatorInitials, trialScheduleLabel, LeadCommentsPanel } from './LeadCard.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';

/**
 * Карточка лида на странице «Пробные» — просмотр + комментарии, перенос
 * даты пробного (⋮) и «Создать студента» (открывает «Добавить в группу»,
 * см. TrialsPage), после чего лид у оператора на «Заявки» переходит в
 * «Пробный проведён».
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor]
 * @param {string} [props.operatorName]
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCreateStudent
 * @param {(lead: Object) => void} props.onReschedule «⋮ → Перенести пробный» — открывает TrialFormModal(mode:'reschedule')
 */
export function TrialLeadCard({ lead, operatorColor, operatorName, onOpen, onCreateStudent, onReschedule }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const operatorLabel = operatorInitials(operatorName);
  const hasComments = (lead.commentsCount ?? 0) > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className="flex min-h-[215px] cursor-pointer flex-col gap-2.5 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:border-navy/20 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
        <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>
      <span className="truncate text-[12px] text-muted">{trialScheduleLabel(lead)}</span>
      <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
        {operatorLabel ? (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
            style={{ backgroundColor: `${operatorColor || '#8B94A3'}26`, color: operatorColor || '#8B94A3' }}
          >
            {operatorLabel}
          </span>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            aria-label="Комментарии"
            className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-alt ${
              commentsOpen || hasComments ? 'text-navy' : 'text-muted'
            }`}
          >
            <MessageSquare className="h-4 w-4" fill={hasComments ? 'currentColor' : 'none'} fillOpacity={hasComments ? 0.15 : 1} />
          </button>
          <DropdownMenu items={[{ label: 'Перенести пробный', onClick: () => onReschedule(lead) }]} />
        </div>
      </div>
      {commentsOpen && <LeadCommentsPanel leadId={lead.id} />}
      <div className="mt-auto border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onCreateStudent(lead)}
          className="w-full rounded-field border border-border-strong px-2.5 py-1.5 text-[12px] font-bold text-text hover:bg-surface-alt"
        >
          Создать студента
        </button>
      </div>
      <span className="-mt-1.5 text-[10px] text-muted">
        {formatDateTimeShort(lead.createdAt)}
        {formatSource(lead.source) ? ` · ${formatSource(lead.source)}` : ''}
      </span>
    </div>
  );
}
