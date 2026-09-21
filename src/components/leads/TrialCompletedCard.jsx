import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { formatPhone, formatDateTimeShort, formatOverdueBy, formatSource } from '../../lib/format.js';
import { operatorInitials, HistoryTimeline } from './LeadCard.jsx';
import { secondLessonAt } from '../../lib/leadFunnel.js';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';

/**
 * Карточка лида на стадиях «Пробный проведён» (студент уже создан на
 * «Пробные», ждёт оплаты) и «Дожим» (тот же ждёт оплаты, оператор с ним
 * работает касаниями; помечен бейджем «Дожим», «Перенос» скрыт) — 3 действия
 * вместо операторского меню.
 * Просрочена (красная рамка + бейдж), если с начала времени «второго
 * урока» (trialDate + 2 дня, см. secondLessonAt) по карточке ничего не
 * сделали — она бы тогда так и осталась тут висеть.
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor]
 * @param {string} [props.operatorName]
 * @param {string} [props.teacherName]
 * @param {string} [props.groupCode]
 * @param {{label: string, color: string}} [props.closingStage] название и цвет колонки «Дожим» из настроек филиала (её могли переименовать)
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onPay
 * @param {(lead: Object) => void} props.onDeferPayment
 * @param {(lead: Object) => void} props.onArchive
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDelete полное удаление за паролем (DeleteLeadModal)
 */
export function TrialCompletedCard({
  lead,
  operatorColor,
  operatorName,
  teacherName,
  groupCode,
  closingStage = { label: 'Дожим', color: '#7C5CBF' },
  onOpen,
  onPay,
  onDeferPayment,
  onArchive,
  onEdit,
  onDelete,
}) {
  const [expanded, setExpanded] = useState(false);
  const operatorLabel = operatorInitials(operatorName);

  const trialDateJs = lead.trialDate?.toDate?.();
  const secondLessonDate = trialDateJs ? secondLessonAt(trialDateJs) : null;
  const inClosing = lead.funnelStage === 'closing';
  // В «Дожиме» срок второго урока уже не показатель — карточка не красная.
  const overdue = !inClosing && secondLessonDate ? Date.now() > secondLessonDate.getTime() : false;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className={`flex h-[300px] cursor-pointer flex-col gap-2.5 rounded-xl border bg-card p-3.5 pb-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        overdue ? 'border-danger ring-1 ring-danger/40' : 'border-border hover:border-navy/20'
      }`}
    >
      <div className="-mx-3.5 -mt-3.5 flex items-center justify-between gap-2 rounded-t-xl bg-card-head px-3.5 pb-2 pt-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
          {inClosing && (
            <span
              className="shrink-0 rounded-badge px-1.5 py-0.5 text-[10px] font-bold"
              style={{ backgroundColor: `${closingStage.color}26`, color: closingStage.color }}
            >
              {closingStage.label}
            </span>
          )}
          {overdue && (
            <span className="shrink-0 rounded-badge bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger">
              {formatOverdueBy(secondLessonDate) || 'Просрочено'}
            </span>
          )}
        </div>
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>
      <span className="truncate text-[12px] text-muted">
        {teacherName ?? '—'} · {groupCode ?? '—'} · {trialDateJs ? formatDateTimeShort(lead.trialDate) : 'дата не указана'}
      </span>
      {/* Вся история взаимодействий — та же лента, что на карточке в «Заявках». */}
      <div className="flex min-h-0 flex-1 flex-col empty:hidden" onClick={(e) => e.stopPropagation()}>
        <HistoryTimeline lead={lead} />
      </div>

      <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title="Продвинуть"
            className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-field border border-border-strong px-1.5 py-1 text-[11px] font-bold text-text hover:bg-surface-alt"
          >
            Продвинуть <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <DropdownMenu
            items={[
              { label: 'Редактировать', onClick: () => onEdit(lead) },
              { label: 'Удалить навсегда', danger: true, onClick: () => onDelete(lead) },
            ]}
          />
        </div>
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
            {!inClosing && (
              <button
                type="button"
                onClick={() => onDeferPayment(lead)}
                title="Перенос оплаты"
                className="min-w-0 flex-1 truncate rounded-field border border-navy/40 px-1.5 py-1 text-[11px] font-bold text-navy hover:bg-navy/5"
              >
                Перенос
              </button>
            )}
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
      {/* Дата/источник слева, инициалы оператора — в правом нижнем углу, как на карточках «Заявок». */}
      <div className="-mt-1 flex items-end justify-between">
        <span className="text-[10px] text-muted">
          {formatDateTimeShort(lead.createdAt)}
          {formatSource(lead.source) ? ` · ${formatSource(lead.source)}` : ''}
        </span>
        {operatorLabel && (
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
            style={{ backgroundColor: `${operatorColor || '#8B94A3'}26`, color: operatorColor || '#8B94A3' }}
          >
            {operatorLabel}
          </span>
        )}
      </div>
    </div>
  );
}
