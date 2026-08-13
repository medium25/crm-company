import { useEffect, useRef, useState } from 'react';
import { Info, Plus } from 'lucide-react';
import { LeadCard } from './LeadCard.jsx';

/**
 * Значок «ⓘ» рядом с названием колонки — попап с инструкцией по работе с
 * карточками на этой стадии (`column.hint`, см. columns.js). Тот же паттерн
 * открытия/закрытия (клик вне / Escape), что у попапов на LeadCard.
 * @param {{summary: string, steps: Array<string>}} hint
 */
function ColumnHint({ hint }) {
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Как работать с карточками на этой стадии"
        className="flex h-5 w-5 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-navy"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-20 w-72 rounded-field border border-border bg-surface p-3 text-left shadow-hover">
          <p className="mb-2 text-[13px] font-bold text-text">{hint.summary}</p>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-muted">
            {hint.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Одна колонка kanban-доски «Заявки» — заголовок (название/счётчик/ⓘ/+) и
 * drop-зона. Читает id перетаскиваемого лида из dataTransfer (см.
 * LeadCard.onDragStart) и передаёт наверх через onDropLead — сама колонка
 * не решает, что писать в Firestore, это знает только LeadsPage.
 * @param {Object} props
 * @param {{key: string, label: string, hint?: {summary: string, steps: Array<string>}}} props.column
 * @param {Array<Object>} props.leads лиды этой колонки, уже отфильтрованные
 * @param {Map<string, {color?: string, name: string}>} props.operatorByUid
 * @param {() => void} props.onAdd
 * @param {(leadId: string, columnKey: string) => void} props.onDropLead
 */
export function LeadColumn({ column, leads, operatorByUid, onAdd, onDropLead, ...cardActions }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-card bg-surface-alt">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-1.5">
          <span className="text-[15px] font-bold text-text">{column.label}</span>
          {column.hint && <ColumnHint hint={column.hint} />}
        </span>
        <span className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-muted">{leads.length}</span>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              aria-label={`Добавить лида: ${column.label}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const leadId = e.dataTransfer.getData('text/plain');
          if (leadId) onDropLead(leadId, column.key);
        }}
        className={`flex-1 space-y-2 border-t px-3 py-3 ${dragOver ? 'border-navy bg-orange-soft/30' : 'border-border'}`}
      >
        {leads.length === 0 ? (
          <p className="py-4 text-center text-[14px] text-muted">Пусто</p>
        ) : (
          leads.map((lead) => {
            const op = operatorByUid.get(lead.assignedOperator);
            return <LeadCard key={lead.id} lead={lead} operatorColor={op?.color} operatorName={op?.name} {...cardActions} />;
          })
        )}
      </div>
    </div>
  );
}
