import { useEffect, useMemo, useRef, useState } from 'react';
import { isToday, isTomorrow, isSameMonth, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronDown, ChevronRight, Info, Plus, CheckCircle2, XCircle } from 'lucide-react';
import { LeadCard } from './LeadCard.jsx';
import { STAGE_COLOR_SWATCHES } from './columns.js';
import { stageDeadline, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { pluralize } from '../../lib/format.js';

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
 * Название колонки — само служит триггером редактирования (двойной клик),
 * без отдельной иконки-карандаша. Попап правит `label`/`color` (ключ
 * стадии и порядок неизменны, см. `withStageOverrides` в columns.js).
 * Сохранение пишет в `settings/{branchId}.leadStageOverrides.{key}` через
 * `onEdit`.
 * @param {{label: string, color: string}} props.column
 * @param {(patch: {label: string, color: string}) => void} props.onEdit
 */
function EditableStageTitle({ column, onEdit }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(column.label);
  const [color, setColor] = useState(column.color);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    setLabel(column.label);
    setColor(column.color);
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
  }, [open, column.label, column.color]);

  const save = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    onEdit({ label: trimmed, color });
    setOpen(false);
  };

  return (
    <span ref={ref} className="relative">
      <span
        role="button"
        tabIndex={0}
        onDoubleClick={() => setOpen(true)}
        title="Двойной клик — редактировать стадию"
        className="truncate text-[15px] font-bold uppercase tracking-wide text-text"
      >
        {column.label}
      </span>
      {open && (
        <div className="absolute left-1/2 top-7 z-20 w-64 -translate-x-1/2 rounded-field border border-border bg-surface p-3 text-left normal-case shadow-hover">
          <label className="mb-2 block">
            <span className="mb-1 block text-[12px] text-muted">Название стадии</span>
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="h-9 w-full rounded-field border border-border-strong bg-white px-2.5 text-[13px] text-text focus:border-navy focus:outline-none"
            />
          </label>
          <span className="mb-1 block text-[12px] text-muted">Цвет</span>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {STAGE_COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={`h-6 w-6 rounded-full ${color === c ? 'ring-2 ring-navy ring-offset-1' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-field px-2.5 py-1.5 text-[12px] text-muted hover:bg-surface-alt"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-field bg-navy px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-navy-hover"
            >
              Сохранить
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Свёрнутая/развёрнутая папка карточек внутри колонки — «Пробный
 * назначен» (см. groupLeadsByTrialDay), «Оплачено»/«Отказ» по месяцам
 * (см. groupLeadsByMonth) и внутри «Отказ» ещё по причине (см.
 * groupLeadsByReason). Рендерится всегда, даже пустой — «Завтра» без
 * карточек всё равно должна быть видна, а не пропадать из списка;
 * `children` (если задан) заменяет автоматический рендер карточек —
 * нужно для вложенных групп причин внутри группы месяца.
 *
 * `closedIcon`/`closedTone`/`closedCaption` — только для верхнего уровня
 * «Оплачено»/«Отказ» (см. вызов в LeadColumn ниже): в свёрнутом виде
 * вместо тонкой строки-заголовка — крупная иконка в цветном круге, месяц
 * и подпись с числом, сразу понятно won/lost без открытия. Остальные
 * группы (Сегодня/Завтра/причины) эти пропсы не передают — используют
 * обычный компактный вид.
 * @param {{title: string, subtitle?: string, leads: Array<Object>, operatorByUid: Map, cardActions: Object, defaultOpen?: boolean, children?: import('react').ReactNode, closedIcon?: import('react').ComponentType, closedTone?: 'success'|'danger', closedCaption?: string}} props
 */
function LeadGroup({ title, subtitle, leads, operatorByUid, cardActions, defaultOpen = true, children, closedIcon: ClosedIcon, closedTone, closedCaption }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open && ClosedIcon) {
    const toneClasses =
      closedTone === 'danger'
        ? 'bg-[rgba(190,18,60,0.13)] text-[#BE123C] dark:bg-[rgba(253,164,175,0.15)] dark:text-[#FDA4AF]'
        : 'bg-success/15 text-success';
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex min-h-[190px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface shadow-sm"
      >
        <ChevronRight className="absolute right-3.5 top-3.5 h-3.5 w-3.5 text-muted" />
        <span className={`flex h-14 w-14 items-center justify-center rounded-full ${toneClasses}`}>
          <ClosedIcon className="h-6 w-6" />
        </span>
        <span className="text-[17px] font-extrabold text-text">{title}</span>
        {closedCaption && <span className="text-[13px] font-semibold text-muted">{closedCaption}</span>}
      </button>
    );
  }

  // Свёрнутая группа без иконки (Сегодня/Завтра/причины) — та же высота,
  // что у LeadCard (min-h-[190px]), заголовок по центру — чтобы в
  // колонке выглядела как карточка, а не тонкая полоска-аккордеон.
  // Развёрнутая — высота по контенту, без навязанного min-height.
  return (
    <div
      className={`rounded-xl border border-border bg-surface shadow-sm ${!open ? 'flex min-h-[190px] flex-col justify-center' : ''}`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-text">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
          {title}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] font-bold text-muted">
          {subtitle && <span className="font-normal">{subtitle}</span>}
          {leads.length}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-border p-2.5">
          {children ??
            (leads.length === 0 ? (
              <p className="py-2 text-center text-[13px] text-muted">Пусто</p>
            ) : (
              leads.map((lead) => {
                const op = operatorByUid.get(lead.assignedOperator);
                return <LeadCard key={lead.id} lead={lead} operatorColor={op?.color} operatorName={op?.name} {...cardActions} />;
              })
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Раскладывает лидов «Пробный назначен» по дню пробного — Сегодня/Завтра/
 * Другой день (включая уже прошедшие и те, что дальше завтра). Порядок
 * внутри групп лиды приносят уже отсортированным (LeadsPage сортирует весь
 * список по trialDate раньше).
 * @param {Array<Object>} leads
 * @returns {{today: Array, tomorrow: Array, other: Array}}
 */
export function groupLeadsByTrialDay(leads) {
  const groups = { overdue: [], today: [], tomorrow: [], other: [] };
  const now = Date.now();
  for (const lead of leads) {
    const d = lead.trialDate?.toDate?.();
    const deadline = stageDeadline(lead);
    if (deadline && now > deadline.getTime() && !(d && isToday(d))) {
      groups.overdue.push(lead);
      continue;
    }
    if (d && isToday(d)) groups.today.push(lead);
    else if (d && isTomorrow(d)) groups.tomorrow.push(lead);
    else groups.other.push(lead);
  }
  return groups;
}

/** Первая непустая Firestore-дата лида среди перечисленных полей, как JS Date (или null). */
function firstLeadDate(lead, fields) {
  for (const field of fields) {
    const d = lead[field]?.toDate?.();
    if (d) return d;
  }
  return null;
}

/** «август 2026» → «Август 2026» — date-fns ru отдаёт название месяца с маленькой буквы. */
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Группирует лидов «Оплачено»/«Отказ» по календарному месяцу — раньше эти
 * стадии были видны только за текущий месяц (см. комментарий в
 * LeadsPage.jsx), теперь видны все, но свёрнуты по месяцам, открыт по
 * умолчанию только текущий. `dateFields` — приоритет полей даты (для
 * «Оплачено»: paidAt, для «Отказ»: lostAt, оба с фоллбэком на updatedAt —
 * у части старых записей нужного поля могло не быть).
 * @param {Array<Object>} leads
 * @param {Array<string>} dateFields
 * @returns {Array<{key: string, label: string, isCurrent: boolean, leads: Array<Object>}>} новые месяцы впереди
 */
export function groupLeadsByMonth(leads, dateFields) {
  const now = new Date();
  const buckets = new Map();
  for (const lead of leads) {
    const d = firstLeadDate(lead, dateFields) ?? now;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        sortDate: new Date(d.getFullYear(), d.getMonth(), 1),
        label: capitalize(format(d, 'LLLL yyyy', { locale: ru })),
        isCurrent: isSameMonth(d, now),
        leads: [],
      });
    }
    buckets.get(key).leads.push(lead);
  }
  return Array.from(buckets.values()).sort((a, b) => b.sortDate - a.sortDate);
}

/**
 * Группирует лидов «Отказ» внутри одного месяца по причине (lostReason) —
 * заголовок каждой группы несёт число и процент от отказов ЭТОГО месяца
 * (не от всех отказов за всё время — группа и так уже внутри месяца).
 * @param {Array<Object>} leads
 * @returns {Array<{key: string, label: string, percent: number, leads: Array<Object>}>} по убыванию числа
 */
export function groupLeadsByReason(leads) {
  const total = leads.length;
  const buckets = new Map();
  for (const lead of leads) {
    const key = lead.lostReason || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(lead);
  }
  return Array.from(buckets.entries())
    .map(([key, group]) => ({
      key,
      // Не входит в LOST_REASON_OPTIONS — старое значение lostReason (список
      // причин расширяли не раз, у части лидов остались значения времён до
      // текущей пятёрки). Раньше все они схлопывались в одну надпись «Без
      // причины» — 4 разные причины выглядели как один повторяющийся
      // пункт. Теперь показываем сам код (humanized), только truly-пустой
      // lostReason — «Без причины».
      label: LOST_REASON_OPTIONS.find((o) => o.value === key)?.label ?? (key === 'unknown' ? 'Без причины' : humanizeReasonKey(key)),
      percent: total ? Math.round((group.length / total) * 100) : 0,
      leads: group,
    }))
    .sort((a, b) => b.leads.length - a.leads.length);
}

/** «other_school» → «Other school» — сырой код причины без перевода, читаемее чем snake_case. */
function humanizeReasonKey(key) {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

/**
 * Одна колонка kanban-доски «Заявки» — заголовок (название/счётчик/ⓘ/+) и
 * drop-зона. Читает id перетаскиваемого лида из dataTransfer (см.
 * LeadCard.onDragStart) и передаёт наверх через onDropLead — сама колонка
 * не решает, что писать в Firestore, это знает только LeadsPage.
 * @param {Object} props
 * @param {{key: string, label: string, color: string, hint?: {summary: string, steps: Array<string>}}} props.column
 * @param {Array<Object>} props.leads лиды этой колонки, уже отфильтрованные
 * @param {Map<string, {color?: string, name: string}>} props.operatorByUid
 * @param {() => void} props.onAdd
 * @param {(leadId: string, columnKey: string) => void} props.onDropLead
 * @param {(columnKey: string, patch: {label: string, color: string}) => void} props.onEditColumn
 */
export function LeadColumn({ column, leads, operatorByUid, onAdd, onDropLead, onEditColumn, ...cardActions }) {
  const [dragOver, setDragOver] = useState(false);
  const isTrialScheduled = column.key === 'trial_scheduled';
  const isWon = column.key === 'won';
  const isLost = column.key === 'lost';
  const groups = useMemo(() => (isTrialScheduled ? groupLeadsByTrialDay(leads) : null), [isTrialScheduled, leads]);
  // «Оплачено»/«Отказ» сгруппированы по месяцу вместо жёсткого фильтра «только
  // текущий месяц», который был раньше (см. комментарий у useMemo(leads) в
  // LeadsPage.jsx) — dateFields задаёт приоритет полей даты для каждой стадии.
  const monthGroups = useMemo(
    () => (isWon ? groupLeadsByMonth(leads, ['paidAt', 'updatedAt']) : isLost ? groupLeadsByMonth(leads, ['lostAt', 'updatedAt']) : null),
    [isWon, isLost, leads],
  );

  return (
    <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-card bg-surface-alt">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 border-b-2 px-4 py-3" style={{ borderBottomColor: column.color }}>
        <span className="flex min-w-0 items-center gap-1.5 justify-self-start">
          {column.hint && <ColumnHint hint={column.hint} />}
        </span>
        <span className="min-w-0 justify-self-center">
          {onEditColumn ? (
            <EditableStageTitle column={column} onEdit={(patch) => onEditColumn(column.key, patch)} />
          ) : (
            <span className="truncate text-[15px] font-bold uppercase tracking-wide text-text">{column.label}</span>
          )}
        </span>
        <span className="flex items-center gap-3 justify-self-end">
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
        className={`flex-1 space-y-2 border-t px-3 py-3 ${dragOver ? 'border-navy bg-orange-soft/30' : 'border-transparent'}`}
      >
        {leads.length === 0 ? (
          <p className="py-4 text-center text-[14px] text-muted">Пусто</p>
        ) : groups ? (
          <>
            {groups.overdue.length > 0 && (
              <LeadGroup title="Просроченные" leads={groups.overdue} operatorByUid={operatorByUid} cardActions={cardActions} />
            )}
            <LeadGroup title="Сегодня" leads={groups.today} operatorByUid={operatorByUid} cardActions={cardActions} />
            <LeadGroup title="Завтра" leads={groups.tomorrow} operatorByUid={operatorByUid} cardActions={cardActions} />
            <LeadGroup title="Другой день" leads={groups.other} operatorByUid={operatorByUid} cardActions={cardActions} />
          </>
        ) : monthGroups ? (
          <>
            {monthGroups.map((month) =>
              isLost ? (
                <LeadGroup
                  key={month.key}
                  title={month.label}
                  leads={month.leads}
                  defaultOpen={month.isCurrent}
                  closedIcon={XCircle}
                  closedTone="danger"
                  closedCaption={`${month.leads.length} ${pluralize(month.leads.length, ['отказ', 'отказа', 'отказов'])}`}
                >
                  <div className="space-y-2">
                    {groupLeadsByReason(month.leads).map((reason) => (
                      <LeadGroup
                        key={reason.key}
                        title={reason.label}
                        subtitle={`${reason.percent}% ·`}
                        leads={reason.leads}
                        operatorByUid={operatorByUid}
                        cardActions={cardActions}
                        defaultOpen={false}
                      />
                    ))}
                  </div>
                </LeadGroup>
              ) : (
                <LeadGroup
                  key={month.key}
                  title={month.label}
                  leads={month.leads}
                  operatorByUid={operatorByUid}
                  cardActions={cardActions}
                  defaultOpen={month.isCurrent}
                  closedIcon={CheckCircle2}
                  closedTone="success"
                  closedCaption={`${month.leads.length} ${pluralize(month.leads.length, ['оплатил', 'оплатили', 'оплатили'])}`}
                />
              ),
            )}
          </>
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
