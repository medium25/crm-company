import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight, AlertTriangle, PhoneOff, Info } from 'lucide-react';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS, isForwardAllowed } from './columns.js';
import { isPriorityLead, stageDeadline, overdueReasonLabel, callScheduleHint, isTrialDay, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDate, formatDateTime, formatDateTimeShort } from '../../lib/format.js';

const ENGAGEMENT_OPTIONS = [
  { value: 'low', label: 'Низкая' },
  { value: 'medium', label: 'Средняя' },
  { value: 'high', label: 'Высокая' },
];

const MAX_ATTEMPTS = 5;

/** Ряд из 5 точек — попытки дозвона, см. 2026-08-12-lead-card-call-attempts-design.md. */
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
  const hint = callScheduleHint(attempts);

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
      {!isCold && hint && <span className="text-[11px] text-muted">{hint}</span>}
    </div>
  );
}

/**
 * Бейдж «!» в углу карточки (просрочен дедлайн стадии) — клик показывает,
 * что именно просрочено и до какого момента. Тот же трюк с позиционированием
 * относительно карточки, что у LeadInfoPopover (см. ниже) — сам бейдж уже
 * absolute в углу, попап растягивается на всю ширину карточки под ним.
 */
function OverdueBadge({ reason, deadline }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Причина просрочки"
        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-white shadow-sm"
      >
        <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
      </button>
      {open && (
        <div className="absolute inset-x-2.5 top-7 z-20 rounded-field border border-border bg-surface p-3 shadow-hover">
          <p className="text-[13px] font-bold leading-snug text-text">{reason}</p>
          {deadline && <p className="mt-1 text-[11px] leading-snug text-muted">Срок был до {deadline}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Иконка «i» — доп. информация о лиде (напр. russianLevel из синка Google
 * Sheets, см. appsscript/SheetsSync.gs), скрытая с карточки по умолчанию,
 * чтобы не загромождать компактный вид. Рендерится только если есть что
 * показывать.
 */
function LeadInfoPopover({ question, answer }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Позиционируется НЕ относительно себя/иконки (та почти всегда не по
  // центру карточки — из-за этого попап вылезал за левый край), а
  // относительно всей карточки (см. `relative` на корневом div карточки
  // ниже) — inset-x повторяет её собственный внутренний отступ p-2.5,
  // поэтому попап всегда ровно по ширине карточки, не шире и не уже.
  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Доп. информация"
        className="flex h-3.5 w-3.5 items-center justify-center text-muted hover:text-navy"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute inset-x-2.5 top-7 z-20 rounded-field border border-border bg-surface p-3 shadow-hover">
          <p className="text-[11px] leading-snug text-muted">{question}</p>
          <p className="mt-1 text-[13px] font-bold leading-snug text-text">{answer}</p>
        </div>
      )}
    </div>
  );
}

/** Попап выбора вовлечённости после отметки явки на пробный — см. Task 6 брифа. */
function EngagementPopover({ onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-field border border-border px-2 py-1 text-[12px] font-bold text-text hover:bg-surface-alt"
      >
        Пришёл
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-10 w-40 rounded-field border border-border bg-surface py-1 shadow-hover">
          {ENGAGEMENT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(o.value);
              }}
              className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-surface-alt"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Блок звонка-подтверждения на стадии «Пробный назначен» до дня пробного
 * (заменяет собой текст с датой) — см. 2026-08-14-trial-confirmation-call-
 * design.md. Попыток сколько угодно, без DeadlineModal: дата дедлайна уже
 * фиксирована (trialDate минус 24ч), тут нечего выбирать.
 * @param {(result: 'success'|'fail') => Promise<void>|void} onMark
 */
function TrialConfirmBlock({ onMark }) {
  const [pending, setPending] = useState(false);

  const mark = async (result) => {
    setPending(true);
    await onMark(result);
    setPending(false);
  };

  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="truncate text-muted">Подтвердить пробный</span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => mark('fail')}
          className="rounded-field border border-border px-2 py-1 text-[12px] text-muted hover:bg-surface-alt disabled:opacity-50"
        >
          Не берёт трубку
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => mark('success')}
          className="rounded-field border border-border px-2 py-1 text-[12px] font-bold text-text hover:bg-surface-alt disabled:opacity-50"
        >
          Дозвонились
        </button>
      </div>
    </div>
  );
}

/**
 * Карточка лида на 7-стадийной воронке «Заявки» (2026-08-13-leads-funnel-
 * redesign.md). Перетаскивается мышью (native HTML5 DnD) только вперёд по
 * стадиям — терминальные (won/lost) не draggable вовсе.
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor] hex-цвет назначенного оператора (`staff.color`)
 * @param {string} [props.operatorName] имя назначенного оператора
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCall открывает полную форму записи звонка
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onDelete полное удаление, только для status=='lead'
 * @param {(lead: Object) => void} props.onScheduleTrial
 * @param {(lead: Object) => void} props.onRescheduleTrial
 * @param {(lead: Object, engagementScore: 'low'|'medium'|'high') => void} props.onMarkAttended
 * @param {(lead: Object) => void} props.onMarkTouch
 * @param {(lead: Object, stageKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkTrialConfirm
 */
export function LeadCard({
  lead,
  operatorColor,
  operatorName,
  onOpen,
  onCall,
  onEdit,
  onDecline,
  onDelete,
  onScheduleTrial,
  onRescheduleTrial,
  onMarkAttended,
  onMarkTouch,
  onMove,
  onMarkAttempt,
  onMarkTrialConfirm,
  columns = COLUMNS,
}) {
  const stage = lead.funnelStage ?? 'new';
  const isTerminal = stage === 'won' || stage === 'lost';
  const attempts = lead.callAttempts ?? [];
  const operatorLabel = (operatorName ?? '').split(' ')[0];

  const createdAt = lead.createdAt?.toDate?.();
  const trialDateJs = lead.trialDate?.toDate?.();
  // Риск-бейдж независим от даты (в отличие от overdue) — загорается сразу
  // после первой неудачной попытки подтверждения, даже если до дедлайна
  // ещё далеко (спек «Риск-бейдж»).
  const trialConfirmAttempts = lead.trialConfirmAttempts ?? [];
  const trialConfirmAtRisk = stage === 'trial_scheduled' && trialConfirmAttempts[trialConfirmAttempts.length - 1]?.result === 'fail';
  const deadline = stageDeadline(lead);
  const overdue = deadline ? Date.now() > deadline.getTime() : false;
  // priority — метка «лид пришёл вне рабочих часов», актуальна только пока
  // не отработан первый SLA на стадии 'new'; дальше по воронке не показываем.
  const priority = stage === 'new' && createdAt ? isPriorityLead(createdAt) : false;

  const menuItems = [
    ...(stage === 'new' || stage === 'calling' ? [{ label: 'Записать на пробный', onClick: () => onScheduleTrial(lead) }] : []),
    { label: 'Записать звонок', onClick: () => onCall(lead) },
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    ...(!isTerminal ? [{ label: 'Отказ', danger: true, onClick: () => onDecline(lead) }] : []),
    // Только для настоящих лидов (status=='lead') — правило Firestore всё
    // равно не даст удалить студента с историей, но незачем и предлагать.
    ...(lead.status === 'lead' ? [{ label: 'Удалить навсегда', danger: true, onClick: () => onDelete(lead) }] : []),
  ];

  const moveItems = columns.filter(
    (c) => isForwardAllowed(stage, c.key) && c.key !== 'lost' && c.key !== 'won' && c.key !== 'trial_scheduled',
  ).map((c) => ({
    label: c.label,
    onClick: () => onMove(lead, c.key),
  }));

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!isTerminal}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className={`group relative flex flex-col gap-1.5 rounded-xl border bg-surface p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isTerminal ? 'cursor-pointer border-border' : 'cursor-grab border-border hover:border-navy/20 active:cursor-grabbing'
      } ${overdue ? 'border-danger ring-1 ring-danger/40' : ''} ${priority && !overdue ? 'border-l-4 border-l-orange-soft' : ''}`}
    >
      {overdue && (
        <OverdueBadge
          reason={overdueReasonLabel(lead)}
          deadline={deadline ? format(deadline, 'dd.MM.yyyy HH:mm', { locale: ru }) : null}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
        <div className="flex shrink-0 items-center gap-1">
          {trialConfirmAtRisk && <PhoneOff className="h-3.5 w-3.5 text-orange" aria-label="Не берёт трубку — подтверждение пробного" />}
          {lead.russianLevel && (
            <LeadInfoPopover question="Rus tilida qanday darajadasiz?" answer={lead.russianLevel} />
          )}
          <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
            {formatPhone(lead.phone)}
          </a>
        </div>
      </div>

      {(stage === 'new' || stage === 'calling') && (
        <div onClick={(e) => e.stopPropagation()}>
          <CallAttemptDots attempts={attempts} onMark={(result) => onMarkAttempt(lead, result)} />
        </div>
      )}

      {stage === 'trial_scheduled' && trialDateJs && !isTrialDay(trialDateJs) && (
        <div onClick={(e) => e.stopPropagation()}>
          <TrialConfirmBlock onMark={(result) => onMarkTrialConfirm(lead, result)} />
        </div>
      )}

      {stage === 'trial_scheduled' && (!trialDateJs || isTrialDay(trialDateJs)) && (
        <div className="flex items-center justify-between gap-2 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-muted">{lead.trialDate ? formatDateTime(lead.trialDate) : 'Дата не указана'}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onRescheduleTrial(lead)}
              className="rounded-field border border-border px-2 py-1 text-[12px] text-muted hover:bg-surface-alt"
            >
              Не пришёл
            </button>
            <EngagementPopover onPick={(score) => onMarkAttended(lead, score)} />
          </div>
        </div>
      )}

      {stage === 'closing' && (
        <div className="flex items-center justify-between gap-2 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-muted">
            Касание {lead.closingTouchNumber ?? 0}/3{lead.nextTouchAt && ` · до ${formatDate(lead.nextTouchAt)}`}
          </span>
          {(lead.closingTouchNumber ?? 0) < 3 && (
            <button
              type="button"
              onClick={() => onMarkTouch(lead)}
              className="rounded-field border border-border px-2 py-1 text-[12px] font-bold text-text hover:bg-surface-alt"
            >
              Отметить касание
            </button>
          )}
        </div>
      )}

      {stage === 'lost' && lead.lostReason && (
        <p className="text-[12px] text-danger">
          Причина: {LOST_REASON_OPTIONS.find((o) => o.value === lead.lostReason)?.label ?? lead.lostReason}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
        <span className="text-[12px] text-muted">{formatDateTimeShort(lead.createdAt)}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {!isTerminal && moveItems.length > 0 && <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />}
          <DropdownMenu items={menuItems} />
        </div>
      </div>

      {operatorLabel && (
        <span
          className="self-end truncate rounded-badge px-1.5 py-0.5 text-[9px] font-bold text-white"
          style={{ backgroundColor: operatorColor || '#8B94A3' }}
        >
          {operatorLabel}
        </span>
      )}
    </div>
  );
}
