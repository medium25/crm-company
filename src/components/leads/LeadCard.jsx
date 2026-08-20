import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { collection, addDoc, doc, updateDoc, increment, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight, PhoneOff, Info, MessageSquare, Clock, Users, X } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS, isForwardAllowed } from './columns.js';
import { isPriorityLead, isTrialDay, contactDueDate, stageDeadline, overdueReasonLabel, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDateTime, formatDateTimeShort, formatRelativeDeadline, formatRelativeDay, formatOverdueBy, formatSource } from '../../lib/format.js';

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

/** «Muslima Azizova» → «MA» — инициалы оператора для бейджа-квадрата, как в Telegram. */
export function operatorInitials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts[1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** «RUS TILI» → «Рус», «INGLIZ TILI» → «Англ» — короткая метка курса для карточки. */
function shortCourseLabel(courseName) {
  if (!courseName) return '';
  if (/rus/i.test(courseName)) return 'Рус';
  if (/ingliz|english/i.test(courseName)) return 'Англ';
  return courseName;
}

/** «Рус - Понедельник - 14:00» вместо голой даты — курс/день недели/время пробного. */
export function trialScheduleLabel(lead) {
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

/** Триггер-точка попытки — общий для CallAttemptDots и UnreachableBlock. */
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
function CallAttemptDots({ attempts, onMark, nextCallDueAt }) {
  const isCold = attempts.length === MAX_ATTEMPTS && attempts.every((a) => a.result === 'fail');
  const deadlineLabel = !isCold && nextCallDueAt ? formatRelativeDeadline(nextCallDueAt) : null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
          const attempt = attempts[i];
          if (attempt) {
            const Icon = attempt.result === 'success' ? CheckCircle2 : XCircle;
            return (
              <DropdownMenu
                key={i}
                items={[{ label: attempt.at ? formatDateTimeShort(attempt.at) : '—', disabled: true }]}
                trigger={({ ref, toggle }) => (
                  <button
                    ref={ref}
                    type="button"
                    onClick={toggle}
                    aria-label={`Попытка ${i + 1}: когда отмечена`}
                    className="flex h-4 w-4 items-center justify-center"
                  >
                    <Icon className={`h-4 w-4 ${attempt.result === 'success' ? 'text-success' : 'text-danger'}`} />
                  </button>
                )}
              />
            );
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
      {deadlineLabel && <span className="text-[12px] font-bold text-text">{deadlineLabel}</span>}
    </div>
  );
}

/** Ряд из 2 точек — касания в «Дожиме» (см. LeadsPage.markTouch), без результата — просто факт касания. */
function TouchDots({ closingTouchNumber, nextTouchAt, onMark }) {
  const count = closingTouchNumber ?? 0;
  const deadlineLabel = count < 2 && nextTouchAt ? formatRelativeDeadline(nextTouchAt) : null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 2 }, (_, i) => {
          if (i < count) return <CheckCircle2 key={i} className="h-4 w-4 text-success" />;
          if (i === count) {
            return <AttemptDot key={i} toggle={onMark} ariaLabel={`Касание ${i + 1}: отметить`} />;
          }
          return <Circle key={i} className="h-4 w-4 text-border" />;
        })}
      </div>
      {deadlineLabel && <span className="text-[12px] font-bold text-text">{deadlineLabel}</span>}
    </div>
  );
}

/**
 * Бейдж «!» в углу карточки (просрочен дедлайн стадии) — клик показывает,
 * что именно просрочено и до какого момента. Тот же трюк с позиционированием
 * относительно карточки, что у LeadInfoPopover (см. ниже) — сам бейдж уже
 * absolute в углу, попап растягивается на всю ширину карточки под ним.
 */
function OverdueBadge({ reason, deadline, overdueBy }) {
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
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Причина просрочки"
        className="rounded-badge bg-danger/10 px-1.5 py-0.5 text-[10px] font-bold text-danger"
      >
        {overdueBy || 'Просрочено'}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-field border border-border bg-surface p-3 shadow-hover">
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
 * «Не выходит на связь» — необязательный трекер, общий для «Пробный
 * назначен» и «Дожим» (тот же сценарий на обеих стадиях). Кнопка-
 * переключатель; открывшись, показывает до 3 попыток связаться. Каждая
 * попытка — «Перенос» (разрешено один раз за цикл — на пробном сдвигает
 * дату через TrialFormModal, в дожиме сразу просит новый дедлайн касания
 * тут же в onMark) или «Неуспешно»; на 3-й неуспешной подряд открывается
 * «Отказ».
 * @param {Object} lead
 * @param {(result: 'reschedule'|'fail') => Promise<void>|void} onMark
 * @param {() => void} onReschedule доп. действие при «Перенос» — на пробном открывает TrialFormModal, в дожиме no-op (там дедлайн уже спрошен внутри onMark)
 * @param {() => void} onDecline
 * @param {import('firebase/firestore').Timestamp|null} [nextAttemptDueAt] дедлайн следующей попытки — на пробном unreachableNextCallDueAt, в дожиме nextTouchAt
 */
function UnreachableBlock({ lead, onMark, onReschedule, onDecline, nextAttemptDueAt }) {
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
          return (
            <DropdownMenu
              key={i}
              items={[{ label: attempt.at ? formatDateTimeShort(attempt.at) : '—', disabled: true }]}
              trigger={({ ref, toggle }) => (
                <button
                  ref={ref}
                  type="button"
                  onClick={toggle}
                  aria-label={`Попытка ${i + 1}: когда отмечена`}
                  className="flex h-4 w-4 items-center justify-center"
                >
                  <Icon className={`h-4 w-4 ${attempt.result === 'reschedule' ? 'text-orange' : 'text-danger'}`} />
                </button>
              )}
            />
          );
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
      {nextAttemptDueAt && failStreak < UNREACHABLE_MAX_ATTEMPTS && (
        <span className="text-[11px] text-muted">до {formatDateTimeShort(nextAttemptDueAt)}</span>
      )}
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
 * @param {(lead: Object) => void} props.onMarkTouch
 * @param {(lead: Object, stageKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt
 * @param {(lead: Object, result: 'reschedule'|'fail') => void} props.onMarkUnreachable
 * @param {(lead: Object, checked: boolean) => void} props.onToggleCallReminder
 * @param {(lead: Object) => void} props.onOpenBooking
 * @param {(lead: Object) => void} props.onDismissFromBoard только для won — скрывает с доски, студент остаётся в системе
 * @param {(lead: Object) => void} props.onResetToNew полный сброс воронки за кодом доступа (ResetLeadModal)
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
  onMarkTouch,
  onMove,
  onMarkAttempt,
  onMarkUnreachable,
  onToggleCallReminder,
  onOpenBooking,
  onDismissFromBoard,
  onResetToNew,
  columns = COLUMNS,
}) {
  const stage = lead.funnelStage ?? 'new';
  const isTerminal = stage === 'won' || stage === 'lost';
  const attempts = lead.callAttempts ?? [];
  const operatorLabel = operatorInitials(operatorName);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const hasComments = (lead.commentsCount ?? 0) > 0;

  const createdAt = lead.createdAt?.toDate?.();
  // Риск-бейдж независим от даты (в отличие от overdue) — загорается сразу
  // после неудачной попытки связаться, даже если до пробного ещё далеко.
  const unreachableAttempts = lead.unreachableAttempts ?? [];
  const trialConfirmAtRisk = stage === 'trial_scheduled' && unreachableAttempts[unreachableAttempts.length - 1]?.result === 'fail';
  // «Не выходит на связь» и «Напомнить через звонок» имеют смысл только в
  // контактный день (см. contactDueDate в leadFunnel.js — обычно день
  // пробного, для слота 9:00 — днём раньше) — до этого связываться ещё рано.
  const trialDay = stage === 'trial_scheduled' && lead.trialDate?.toDate ? isTrialDay(lead.trialDate.toDate()) : false;
  const deadline = stageDeadline(lead);
  const overdue = deadline ? Date.now() > deadline.getTime() : false;
  // priority — метка «лид пришёл вне рабочих часов», актуальна только пока
  // не отработан первый SLA на стадии 'new'; дальше по воронке не показываем.
  const priority = stage === 'new' && createdAt ? isPriorityLead(createdAt) : false;

  const menuItems = [
    // «Пришёл» перенесён на отдельную страницу «Пробные» (там же создаётся
    // сам студент, см. TrialLeadCard) — тут остаётся только «Не пришёл».
    ...(stage === 'trial_scheduled' ? [{ label: 'Не пришёл', onClick: () => onRescheduleTrial(lead) }] : []),
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    // Только для настоящих лидов (status=='lead') — правило Firestore всё
    // равно не даст удалить студента с историей, но незачем и предлагать.
    // Оплаченных не удаляем насовсем никогда, даже если status почему-то
    // остался 'lead' (ручной drag в «Оплачено» без прохода через оплату) —
    // с этой стадии карточку можно только скрыть с доски (см. won-ветку ниже).
    ...(lead.status === 'lead' && stage !== 'won' ? [{ label: 'Удалить навсегда', danger: true, onClick: () => onDelete(lead) }] : []),
    // Полный сброс воронки — за кодом доступа (ResetLeadModal), не для
    // 'new' (сбрасывать уже некуда) и не для 'won' (там своё урезанное
    // меню без этого пункта вовсе).
    ...(stage !== 'new' && stage !== 'won' ? [{ label: 'Вернуть в новый лид', danger: true, onClick: () => onResetToNew(lead) }] : []),
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
      className={`group relative flex min-h-[190px] flex-col gap-2.5 rounded-xl border bg-surface p-3.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isTerminal ? 'cursor-pointer border-border' : 'cursor-grab border-border hover:border-navy/20 active:cursor-grabbing'
      } ${overdue ? 'border-danger ring-1 ring-danger/40' : !isTerminal ? 'border-success ring-1 ring-success/40' : ''} ${
        priority && !overdue ? 'border-l-4 border-l-orange-soft' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
          {overdue ? (
            <OverdueBadge
              reason={overdueReasonLabel(lead)}
              deadline={deadline ? format(deadline, 'dd.MM.yyyy HH:mm', { locale: ru }) : null}
              overdueBy={deadline ? formatOverdueBy(deadline) : null}
            />
          ) : (
            !isTerminal && (
              <span className="shrink-0 rounded-badge bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">В норме</span>
            )
          )}
        </div>
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
          <CallAttemptDots attempts={attempts} onMark={(result) => onMarkAttempt(lead, result)} nextCallDueAt={lead.nextCallDueAt} />
        </div>
      )}

      {stage === 'trial_scheduled' && (
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-[12px] text-muted">{trialScheduleLabel(lead)}</span>
          {!trialDay && lead.trialDate?.toDate && (
            <span className="text-[11px] text-muted">
              Напомнить: {formatRelativeDay(contactDueDate(lead.trialDate.toDate()))}
            </span>
          )}

          {trialDay && (
            <UnreachableBlock
              lead={lead}
              onMark={(result) => onMarkUnreachable(lead, result)}
              onReschedule={() => onRescheduleTrial(lead)}
              onDecline={() => onDecline(lead)}
              nextAttemptDueAt={lead.unreachableNextCallDueAt}
            />
          )}

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
        <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <TouchDots closingTouchNumber={lead.closingTouchNumber} nextTouchAt={lead.nextTouchAt} onMark={() => onMarkTouch(lead)} />
          <UnreachableBlock
            lead={lead}
            onMark={(result) => onMarkUnreachable(lead, result)}
            onReschedule={() => {}}
            onDecline={() => onDecline(lead)}
            nextAttemptDueAt={lead.nextTouchAt}
          />
        </div>
      )}

      {stage === 'lost' && lead.lostReason && (
        <p className="text-[12px] text-danger">
          Причина: {LOST_REASON_OPTIONS.find((o) => o.value === lead.lostReason)?.label ?? lead.lostReason}
          {lead.lostReasonDetail ? ` — ${lead.lostReasonDetail}` : ''}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
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
        {stage === 'won' ? (
          // «Оплачено» — карточка ведёт себя как уведомление: только
          // посмотреть (клик по карточке) и скрыть с доски. Ни коммента, ни
          // ⋮-меню с «Удалить навсегда» тут никогда не было и не будет —
          // студент остаётся в системе, убирается только вид на доске
          // (onDismissFromBoard, см. LeadsPage.boardHiddenAt).
          <button
            type="button"
            onClick={() => onDismissFromBoard(lead)}
            aria-label="Скрыть с доски"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
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
            {!isTerminal && (
              <button
                type="button"
                onClick={() => onOpenBooking(lead)}
                aria-label="Свободные места в группе"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
              >
                <Users className="h-4 w-4" />
              </button>
            )}
            {!isTerminal && moveItems.length > 0 && <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />}
            <DropdownMenu items={menuItems} />
          </div>
        )}
      </div>

      {stage !== 'won' && commentsOpen && <LeadCommentsPanel leadId={lead.id} />}

      <span className="-mt-1.5 text-[10px] text-muted">
        {formatDateTimeShort(lead.createdAt)}
        {formatSource(lead.source) ? ` · ${formatSource(lead.source)}` : ''}
      </span>
    </div>
  );
}
