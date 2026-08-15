import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Pause, Ghost, CheckCircle, ArrowRightLeft, X } from 'lucide-react';
import { db } from '../../firebase.js';
import { useDoc } from '../../hooks/useDoc.js';
import { MIN_FREEZE_BALANCE, MAX_FREEZES_PER_STUDENT, canFreezeStudent } from '../../lib/billing.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { formatDate, formatMoney, formatScheduleType } from '../../lib/format.js';

/**
 * Карточка записи студента в группу — все поля со скриншота 6.
 * @param {Object} props
 * @param {Object} props.enrollment
 * @param {number} props.studentBalance баланс студента — заморозка разрешена только при balance >= MIN_FREEZE_BALANCE
 * @param {number} [props.studentFreezeCount] сколько раз студент уже замораживался за весь срок обучения
 * @param {(enrollment: Object) => void} props.onFreeze
 * @param {(enrollment: Object) => void} props.onLeave
 * @param {(enrollment: Object) => void} props.onActivate
 * @param {(enrollment: Object) => void} props.onUnfreeze
 * @param {(enrollment: Object) => void} props.onTransfer
 */
export function EnrollmentCard({ enrollment, studentBalance, studentFreezeCount, onFreeze, onLeave, onActivate, onUnfreeze, onTransfer }) {
  const navigate = useNavigate();
  const groupRef = useMemo(() => (db ? doc(db, 'groups', enrollment.groupId) : null), [enrollment.groupId]);
  const { data: group } = useDoc(groupRef);

  const canAct = enrollment.status === 'active' || enrollment.status === 'trial' || enrollment.status === 'paused';
  const canFreeze = canFreezeStudent({ balance: studentBalance, freezeCount: studentFreezeCount });
  const freezeLimitReached = (studentFreezeCount ?? 0) >= MAX_FREEZES_PER_STUDENT;
  const freezeDisabledTitle = freezeLimitReached
    ? `Лимит заморозок за весь срок обучения исчерпан (${MAX_FREEZES_PER_STUDENT} из ${MAX_FREEZES_PER_STUDENT})`
    : `Заморозка доступна при балансе от ${formatMoney(MIN_FREEZE_BALANCE)}`;

  const dismissTransferNote = () => {
    updateDoc(doc(db, 'enrollments', enrollment.id), { transferNoteDismissed: true, updatedAt: serverTimestamp() });
  };

  const transferScheduleLabel = enrollment.transferredFromSchedule
    ? ` (${formatScheduleType(enrollment.transferredFromSchedule.type)} · ${enrollment.transferredFromSchedule.time})`
    : '';
  const transferDetails = [
    enrollment.transferredLessonsCount != null ? `${enrollment.transferredLessonsCount} ур.` : null,
    enrollment.transferredAt ? formatDate(enrollment.transferredAt) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const transferNote =
    enrollment.transferredFromGroupCode && !enrollment.transferNoteDismissed
      ? `Переведён из ${enrollment.transferredFromGroupCode}${transferScheduleLabel}${transferDetails ? `, ${transferDetails}` : ''}`
      : null;

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-start justify-between">
        <button
          type="button"
          onClick={() => navigate(`/groups/${enrollment.groupId}`)}
          className="text-left hover:opacity-80"
        >
          <Badge variant="group-code">{enrollment.groupCode}</Badge>
          <p className="mt-2 font-bold text-link">{enrollment.courseName}</p>
          <p className="text-[15px] text-muted">{enrollment.teacherName}</p>
        </button>
        {group && (
          <div className="text-right text-[13px] text-muted">
            <p>
              {formatDate(group.startDate)} — {formatDate(group.endDate)}
            </p>
            <p>
              {formatScheduleType(group.schedule.type)} · {group.schedule.time}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[15px] text-text">Статус: {enrollment.statusLabel}</span>
          <div className="flex items-center gap-1">
            {enrollment.status === 'trial' && (
              <Button variant="icon-round" tone="navy" onClick={() => onActivate(enrollment)} aria-label="Активировать">
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
            {enrollment.status === 'paused' && (
              <Button variant="icon-round" tone="navy" onClick={() => onUnfreeze(enrollment)} aria-label="Снять заморозку">
                <CheckCircle className="h-4 w-4" />
              </Button>
            )}
            {canAct && enrollment.status !== 'paused' && (
              <Button
                variant="icon-round"
                tone="warning"
                onClick={() => onFreeze(enrollment)}
                disabled={!canFreeze}
                aria-label="Заморозить"
                title={canFreeze ? undefined : freezeDisabledTitle}
              >
                <Pause className="h-4 w-4" />
              </Button>
            )}
            {canAct && (
              <Button variant="icon-round" tone="navy" onClick={() => onTransfer(enrollment)} aria-label="Перевести в другую группу">
                <ArrowRightLeft className="h-4 w-4" />
              </Button>
            )}
            {canAct && (
              <Button variant="icon-round" tone="danger" onClick={() => onLeave(enrollment)} aria-label="Вывести из группы">
                <Ghost className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="mb-1">
          <span className="text-[15px] text-muted">Дата добавления: {formatDate(enrollment.addedAt)}</span>
        </div>
        {enrollment.activatedAt && (
          <p className="text-[15px] text-muted">Дата активации: {formatDate(enrollment.activatedAt)}</p>
        )}
        <p className="text-[15px] text-muted">Стоимость для студента: {formatMoney(enrollment.price)}</p>
        {transferNote && (
          <div className="mt-2 flex items-center gap-2 rounded-field border border-navy/20 bg-navy/5 px-3 py-2">
            <ArrowRightLeft className="h-4 w-4 shrink-0 text-navy" />
            <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-navy">{transferNote}</p>
            <button
              type="button"
              onClick={dismissTransferNote}
              aria-label="Скрыть уведомление"
              className="shrink-0 text-navy hover:opacity-70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
