import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS } from './columns.js';
import { formatPhone, formatDate } from '../../lib/format.js';

const STATUS_BADGE = {
  lead: { variant: 'type-system', label: 'Лид' },
  trial: { variant: 'status-active', label: 'Пробный' },
};

const MAX_ATTEMPTS = 5;

/**
 * Ряд из 5 точек — попытки дозвона (2026-08-12-lead-card-call-attempts-design.md).
 * Кликабельна только следующая пустая точка — попытки идут по порядку.
 * Клик открывает попап «Успешно / Не успешно»; выбор красит точку и
 * закрывает попап. Заполненные точки не кликабельны. Если все 5 —
 * неудача, рядом появляется значок «холодный лид».
 */
function CallAttemptDots({ attempts, onMark }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isCold = attempts.length === MAX_ATTEMPTS && attempts.every((a) => a.result === 'fail');

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
          const attempt = attempts[i];
          if (attempt) {
            const Icon = attempt.result === 'success' ? CheckCircle2 : XCircle;
            return <Icon key={i} className={`h-4 w-4 ${attempt.result === 'success' ? 'text-success' : 'text-danger'}`} />;
          }
          if (i === attempts.length) {
            return (
              <div key={i} ref={ref} className="relative">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setOpen((v) => !v)}
                  aria-label={`Попытка ${i + 1}: отметить результат звонка`}
                  className="flex h-4 w-4 items-center justify-center text-border hover:text-navy disabled:opacity-50"
                >
                  <Circle className="h-4 w-4" />
                </button>
                {open && (
                  <div className="absolute left-1/2 top-6 z-10 w-40 -translate-x-1/2 rounded-field border border-border bg-surface py-1 shadow-hover">
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        setPending(true);
                        await onMark('success');
                        setPending(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-surface-alt"
                    >
                      ✓ Успешно
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setOpen(false);
                        setPending(true);
                        await onMark('fail');
                        setPending(false);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-danger hover:bg-surface-alt"
                    >
                      ✕ Не успешно
                    </button>
                  </div>
                )}
              </div>
            );
          }
          return <Circle key={i} className="h-4 w-4 text-border" />;
        })}
      </div>
      {isCold && (
        <span title="Холодный лид: 5 неудачных попыток дозвона" className="flex items-center">
          <Snowflake className="h-4 w-4 text-danger" />
        </span>
      )}
    </div>
  );
}

/**
 * Карточка лида на kanban-доске «Заявки». Перетаскивается мышью (native
 * HTML5 DnD — `draggable`, кладёт свой id в dataTransfer) в любую колонку
 * LeadColumn. Кнопка «→» — то же перемещение по тапу, для тачскринов, где
 * HTML5 DnD не работает вовсе (см. 2026-08-12-leads-kanban-design.md).
 * @param {Object} props
 * @param {Object} props.lead документ `students` со `status` in [lead, trial]
 * @param {string} [props.operatorColor] hex-цвет создателя лида (`staff.color`); без него — нейтральный серый
 * @param {string} [props.operatorName] имя создателя лида — первое слово идёт в тег на карточке
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCall открывает полную форму записи звонка
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onMarkTrial
 * @param {(lead: Object, columnKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt быстрая отметка попытки дозвона
 */
export function LeadCard({ lead, operatorColor, operatorName, onOpen, onCall, onEdit, onDecline, onMarkTrial, onMove, onMarkAttempt }) {
  const menuItems = [
    ...(lead.status === 'lead' ? [{ label: 'Записать на пробный', onClick: () => onMarkTrial(lead) }] : []),
    { label: 'Записать звонок', onClick: () => onCall(lead) },
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    { label: 'Отказ', danger: true, onClick: () => onDecline(lead) },
  ];

  const moveItems = COLUMNS.map((c) => ({ label: c.label, onClick: () => onMove(lead, c.key) }));
  const attempts = lead.callAttempts ?? [];
  const operatorLabel = (operatorName ?? '').split(' ')[0];

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
      className="group flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-navy/20 hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[14px] font-bold leading-tight text-text">{lead.fullName}</p>
        <Badge variant={STATUS_BADGE[lead.status].variant} className="shrink-0">
          {STATUS_BADGE[lead.status].label}
        </Badge>
      </div>

      {operatorLabel && (
        <span
          className="inline-flex w-fit items-center rounded-badge px-2 py-0.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: operatorColor || '#8B94A3' }}
        >
          {operatorLabel}
        </span>
      )}

      <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[13px] text-link">
        {formatPhone(lead.phone)}
      </a>

      <div onClick={(e) => e.stopPropagation()}>
        <CallAttemptDots attempts={attempts} onMark={(result) => onMarkAttempt(lead, result)} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-[12px] text-muted">{formatDate(lead.createdAt)}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />
          <DropdownMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}
