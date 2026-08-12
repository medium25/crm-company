import { Phone, ArrowRight } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS } from './columns.js';
import { formatPhone, formatDate } from '../../lib/format.js';

const STATUS_BADGE = {
  lead: { variant: 'type-system', label: 'Лид' },
  trial: { variant: 'status-active', label: 'Пробный' },
};

function initials(fullName) {
  return (fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/**
 * Карточка лида на kanban-доске «Заявки». Перетаскивается мышью (native
 * HTML5 DnD — `draggable`, кладёт свой id в dataTransfer) в любую колонку
 * LeadColumn. Кнопка «→» — то же перемещение по тапу, для тачскринов, где
 * HTML5 DnD не работает вовсе (см. 2026-08-12-leads-kanban-design.md).
 * @param {Object} props
 * @param {Object} props.lead документ `students` со `status` in [lead, trial]
 * @param {string} [props.operatorColor] hex-цвет создателя лида (`staff.color`); без него — нейтральный серый
 * @param {string} [props.operatorName] имя создателя лида, для tooltip на аватаре
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCall
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onMarkTrial
 * @param {(lead: Object, columnKey: string) => void} props.onMove
 */
export function LeadCard({ lead, operatorColor, operatorName, onOpen, onCall, onEdit, onDecline, onMarkTrial, onMove }) {
  const menuItems = [
    ...(lead.status === 'lead' ? [{ label: 'Записать на пробный', onClick: () => onMarkTrial(lead) }] : []),
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    { label: 'Отказ', danger: true, onClick: () => onDecline(lead) },
  ];

  const moveItems = COLUMNS.map((c) => ({ label: c.label, onClick: () => onMove(lead, c.key) }));

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className="flex cursor-grab items-center gap-3 rounded-field border border-border bg-surface px-3 py-2.5 hover:bg-surface-alt active:cursor-grabbing"
    >
      <div
        title={operatorName}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
        style={{ backgroundColor: operatorColor || '#8B94A3' }}
      >
        {initials(lead.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-text">{lead.fullName}</p>
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[13px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={STATUS_BADGE[lead.status].variant}>{STATUS_BADGE[lead.status].label}</Badge>
        <span className="text-[12px] text-muted">{formatDate(lead.createdAt)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onCall(lead)}
          aria-label="Позвонить"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-navy"
        >
          <Phone className="h-4 w-4" />
        </button>
        <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />
        <DropdownMenu items={menuItems} />
      </div>
    </div>
  );
}
