import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, addDoc, doc, updateDoc, increment, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight, AlertTriangle, PhoneOff, Info, MessageSquare, Clock } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS, isForwardAllowed } from './columns.js';
import { isPriorityLead, isTrialDay, stageDeadline, overdueReasonLabel, callScheduleHint, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDate, formatDateTime, formatDateTimeShort } from '../../lib/format.js';

/**
 * Компактная лента комментариев лида, разворачивается прямо в карточке.
 * Та же коллекция `comments` (entityType/entityId), что и CommentsTab у
 * студента/группы, но своя вёрстка — под тесную карточку в канбане, ввод
 * одной строкой («командная строка»), без textarea и большой кнопки.
 */
function LeadCommentsPanel({ leadId }) {
  const { user, staff } = useAuth();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const commentsQuery = useMemo(
    () =>
      db
        ? query(collection(db, 'comments'), where('entityType', '==', 'lead'), where('entityId', '==', leadId), orderBy('createdAt', 'desc'))
        : null,
    [leadId],
  );
  const { data: comments, loading } = useCollection(commentsQuery);

  const submit = async () => {
    const value = text.trim();
    if (!value || saving) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'comments'), {
        entityType: 'lead',
        entityId: leadId,
        text: value,
        authorId: user.uid,
        authorName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      // Денормализованный счётчик на самом лиде — чтобы иконка комментария
      // могла показать «тут есть записи», не открывая отдельный listener
      // на comments для каждой из карточек на доске.
      await updateDoc(doc(db, 'students', leadId), { commentsCount: increment(1) });
      setText('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1.5 border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="max-h-40 space-y-1.5 overflow-y-auto">
        {loading && <p className="text-[12px] text-muted">Загрузка…</p>}
        {!loading && comments.length === 0 && <p className="text-[12px] text-muted">Пока нет комментариев</p>}
        {comments.map((c) => (
          <div key={c.id} className="text-[12px]">
            <span className="font-bold text-text">{c.authorName}</span>{' '}
            <span className="text-muted">{formatDateTime(c.createdAt)}</span>
            <p className="whitespace-pre-wrap text-text">{c.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1 rounded-field border border-border-strong bg-surface-alt px-2 py-1">
        <span className="shrink-0 font-mono text-[13px] text-muted">&gt;</span>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.stopPropagation();
            submit();
          }}
          placeholder="Написать комментарий…"
          disabled={saving}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-text placeholder:text-muted focus:outline-none"
        />
      </div>
    </div>
  );
}

/** «RUS TILI» → «Рус», «INGLIZ TILI» → «Англ» — короткая метка курса для карточки. */
function shortCourseLabel(courseName) {
  if (!courseName) return '';
  if (/rus/i.test(courseName)) return 'Рус';
  if (/ingliz|english/i.test(courseName)) return 'Англ';
  return courseName;
}

/** «Рус - Понедельник - 14:00» вместо голой даты — курс/день недели/время пробного. */
function trialScheduleLabel(lead) {
  const trialDateJs = lead.trialDate?.toDate?.();
  if (!trialDateJs) return 'Дата не указана';
  const weekday = format(trialDateJs, 'EEEE', { locale: ru });
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const time = format(trialDateJs, 'HH:mm');
  const course = shortCourseLabel(lead.trialCourseName);
  return course ? `${course} - ${weekdayCap} - ${time}` : `${weekdayCap} - ${time}`;
}

const MAX_ATTEMPTS = 5;
const UNREACHABLE_MAX_ATTEMPTS = 3;

/** Триггер-точка попытки — общий для CallAttemptDots и TrialUnreachableBlock. */
function AttemptDot({ ref, toggle, ariaLabel }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      aria-label={ariaLabel}
      className="flex h-4 w-4 items-center justify-center text-border hover:text-navy"
    >
      <Circle className="h-4 w-4" />
    </button>
  );
}

/**
 * Ряд из 5 точек — попытки дозвона, см. 2026-08-12-lead-card-call-attempts-design.md.
 * Меню выбора результата — через DropdownMenu (портал, `position: fixed`) —
 * точка попытки лежит у левого края узкой карточки в канбане, обычный
 * absolute-попап вылезал за край карточки и обрезался/наезжал на соседнюю
 * колонку.
 */
function CallAttemptDots({ attempts, onMark }) {
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
              <DropdownMenu
                key={i}
                items={[
                  { label: '✓ Успешно', onClick: () => onMark('success') },
                  { label: '✕ Не успешно', danger: true, onClick: () => onMark('fail') },
                ]}
                trigger={({ ref, toggle }) => (
                  <AttemptDot ref={ref} toggle={toggle} ariaLabel={`Попытка ${i + 1}: отметить результат звонка`} />
                )}
              />
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

/**
 * «Не выходит на связь» — необязательный трекер на стадии «Пробный
 * назначен». Кнопка-переключатель; открывшись, показывает до 3 попыток
 * связаться. Каждая попытка — «Перенос» (сдвигает дату через ту же форму,
 * что открывает «Не пришёл»; разрешено один раз за цикл) или «Неуспешно»;
 * на 3-й неуспешной подряд открывается «Отказ».
 * @param {Object} lead
 * @param {(result: 'reschedule'|'fail') => Promise<void>|void} onMark
 * @param {() => void} onReschedule
 * @param {() => void} onDecline
 */
function TrialUnreachableBlock({ lead, onMark, onReschedule, onDecline }) {
  const attempts = lead.unreachableAttempts ?? [];
  const [active, setActive] = useState(attempts.length > 0);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="self-start text-[12px] text-muted underline decoration-dotted underline-offset-2 hover:text-text"
      >
        Не выходит на связь
      </button>
    );
  }

  const rescheduleUsed = attempts.some((a) => a.result === 'reschedule');
  const failStreak = attempts.filter((a) => a.result === 'fail').length;

  const pick = async (result) => {
    await onMark(result);
    if (result === 'reschedule') onReschedule();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {Array.from({ length: UNREACHABLE_MAX_ATTEMPTS }, (_, i) => {
        const attempt = attempts[i];
        if (attempt) {
          const Icon = attempt.result === 'reschedule' ? Clock : XCircle;
          return <Icon key={i} className={`h-4 w-4 ${attempt.result === 'reschedule' ? 'text-orange' : 'text-danger'}`} />;
        }
        if (i !== attempts.length) return <Circle key={i} className="h-4 w-4 text-border" />;
        return (
          <DropdownMenu
            key={i}
            items={[
              ...(rescheduleUsed ? [] : [{ label: 'Перенос', onClick: () => pick('reschedule') }]),
              { label: 'Неуспешно', danger: true, onClick: () => pick('fail') },
            ]}
            trigger={({ ref, toggle }) => <AttemptDot ref={ref} toggle={toggle} ariaLabel={`Попытка ${i + 1}: связаться`} />}
          />
        );
      })}
      {failStreak >= UNREACHABLE_MAX_ATTEMPTS && (
        <button
          type="button"
          onClick={onDecline}
          className="rounded-field border border-danger px-2 py-1 text-[12px] font-bold text-danger hover:bg-danger/10"
        >
          Отказ
        </button>
      )}
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
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onDelete полное удаление, только для status=='lead'
 * @param {(lead: Object) => void} props.onScheduleTrial
 * @param {(lead: Object) => void} props.onRescheduleTrial
 * @param {(lead: Object, engagementScore: 'low'|'medium'|'high') => void} props.onMarkAttended
 * @param {(lead: Object) => void} props.onMarkTouch
 * @param {(lead: Object, stageKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt
 * @param {(lead: Object, result: 'reschedule'|'fail') => void} props.onMarkUnreachable
 * @param {(lead: Object, checked: boolean) => void} props.onToggleCallReminder
 */
export function LeadCard({
  lead,
  operatorColor,
  operatorName,
  onOpen,
  onEdit,
  onDecline,
  onDelete,
  onScheduleTrial,
  onRescheduleTrial,
  onMarkAttended,
  onMarkTouch,
  onMove,
  onMarkAttempt,
  onMarkUnreachable,
  onToggleCallReminder,
  columns = COLUMNS,
}) {
  const stage = lead.funnelStage ?? 'new';
  const isTerminal = stage === 'won' || stage === 'lost';
  const attempts = lead.callAttempts ?? [];
  const operatorLabel = (operatorName ?? '').split(' ')[0];
  const [commentsOpen, setCommentsOpen] = useState(false);
  const hasComments = (lead.commentsCount ?? 0) > 0;

  const createdAt = lead.createdAt?.toDate?.();
  // Риск-бейдж независим от даты (в отличие от overdue) — загорается сразу
  // после неудачной попытки связаться, даже если до пробного ещё далеко.
  const unreachableAttempts = lead.unreachableAttempts ?? [];
  const trialConfirmAtRisk = stage === 'trial_scheduled' && unreachableAttempts[unreachableAttempts.length - 1]?.result === 'fail';
  // Чекбокс «Напомнить через звонок» имеет смысл только в день пробного —
  // до этого дня напоминать ещё не о чем (вместе с этим и загорается overdue).
  const trialDay = stage === 'trial_scheduled' && lead.trialDate?.toDate ? isTrialDay(lead.trialDate.toDate()) : false;
  const deadline = stageDeadline(lead);
  const overdue = deadline ? Date.now() > deadline.getTime() : false;
  // priority — метка «лид пришёл вне рабочих часов», актуальна только пока
  // не отработан первый SLA на стадии 'new'; дальше по воронке не показываем.
  const priority = stage === 'new' && createdAt ? isPriorityLead(createdAt) : false;

  const menuItems = [
    // Раньше жили отдельными кнопками на карточке «Пробный назначен» —
    // унесли сюда, чтобы освободить место под курс/время/чекбоксы.
    // «Пришёл» без пикера вовлечённости — сразу «средняя», её можно
    // поправить через «Редактировать» при необходимости.
    ...(stage === 'trial_scheduled' ? [{ label: 'Пришёл', onClick: () => onMarkAttended(lead, 'medium') }] : []),
    ...(stage === 'trial_scheduled' ? [{ label: 'Не пришёл', onClick: () => onRescheduleTrial(lead) }] : []),
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    // Только для настоящих лидов (status=='lead') — правило Firestore всё
    // равно не даст удалить студента с историей, но незачем и предлагать.
    ...(lead.status === 'lead' ? [{ label: 'Удалить навсегда', danger: true, onClick: () => onDelete(lead) }] : []),
  ];

  const moveItems = columns.filter(
    (c) => isForwardAllowed(stage, c.key),
  ).map((c) => ({
    label: c.label,
    danger: c.key === 'lost',
    // «Пробный назначен» требует дату/время/учителя, «Отказ» — причину из
    // фиксированного списка — открываем те же формы, что и «⋮», вместо
    // голого onMove.
    onClick: () => {
      if (c.key === 'trial_scheduled') return onScheduleTrial(lead);
      if (c.key === 'lost') return onDecline(lead);
      return onMove(lead, c.key);
    },
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

      {/* Время прихода лида — не показываем на «Пробном назначен», там своя строка (курс/день/время). */}
      {stage !== 'trial_scheduled' && <span className="text-[12px] text-muted">{formatDateTimeShort(lead.createdAt)}</span>}

      {(stage === 'new' || stage === 'calling') && (
        <div onClick={(e) => e.stopPropagation()}>
          <CallAttemptDots attempts={attempts} onMark={(result) => onMarkAttempt(lead, result)} />
        </div>
      )}

      {stage === 'trial_scheduled' && (
        <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-[12px] text-muted">{trialScheduleLabel(lead)}</span>

          <TrialUnreachableBlock
            lead={lead}
            onMark={(result) => onMarkUnreachable(lead, result)}
            onReschedule={() => onRescheduleTrial(lead)}
            onDecline={() => onDecline(lead)}
          />

          {trialDay && (
            <label className="flex items-center gap-1.5 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={Boolean(lead.callReminderDone)}
                onChange={(e) => onToggleCallReminder(lead, e.target.checked)}
              />
              {lead.callReminderDone ? 'Напомнили через звонок' : 'Напомнить через звонок'}
            </label>
          )}
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
        {operatorLabel ? (
          <span
            className="truncate rounded-badge px-1.5 py-0.5 text-[9px] font-bold text-white"
            style={{ backgroundColor: operatorColor || '#8B94A3' }}
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
          {!isTerminal && moveItems.length > 0 && <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />}
          <DropdownMenu items={menuItems} />
        </div>
      </div>

      {commentsOpen && <LeadCommentsPanel leadId={lead.id} />}
    </div>
  );
}
