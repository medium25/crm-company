import { useMemo } from 'react';
import { doc } from 'firebase/firestore';
import { Pause, Ghost } from 'lucide-react';
import { db } from '../../firebase.js';
import { useDoc } from '../../hooks/useDoc.js';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { formatDate, formatMoney, formatScheduleType } from '../../lib/format.js';

/**
 * Карточка записи студента в группу — все поля со скриншота 6.
 * @param {Object} props
 * @param {Object} props.enrollment
 * @param {(enrollment: Object) => void} props.onFreeze
 * @param {(enrollment: Object) => void} props.onLeave
 */
export function EnrollmentCard({ enrollment, onFreeze, onLeave }) {
  const groupRef = useMemo(() => (db ? doc(db, 'groups', enrollment.groupId) : null), [enrollment.groupId]);
  const { data: group } = useDoc(groupRef);

  const canAct = enrollment.status === 'active' || enrollment.status === 'trial' || enrollment.status === 'paused';

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <Badge variant="group-code">{enrollment.groupCode}</Badge>
          <p className="mt-2 font-bold text-text">{enrollment.courseName}</p>
          <p className="text-[15px] text-muted">{enrollment.teacherName}</p>
        </div>
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
          {canAct && enrollment.status !== 'paused' && (
            <Button variant="icon-round" tone="warning" onClick={() => onFreeze(enrollment)} aria-label="Заморозить">
              <Pause className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[15px] text-muted">Дата добавления: {formatDate(enrollment.addedAt)}</span>
          {canAct && (
            <Button variant="icon-round" tone="danger" onClick={() => onLeave(enrollment)} aria-label="Вывести из группы">
              <Ghost className="h-4 w-4" />
            </Button>
          )}
        </div>
        {enrollment.activatedAt && (
          <p className="text-[15px] text-muted">Дата активации: {formatDate(enrollment.activatedAt)}</p>
        )}
        <p className="text-[15px] text-muted">Стоимость для студента: {formatMoney(enrollment.price)}</p>
      </div>
    </div>
  );
}
