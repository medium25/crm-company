import { useEffect, useState } from 'react';
import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { logActivity } from '../../lib/activityLog.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Снятие заморозки — запись возвращается в «Активен». Дата возобновления
 * спрашивается явно, а не берётся как «сегодня»: студент часто фактически
 * возвращается на занятия за 2-3 дня до того, как это оформляют в системе,
 * поэтому pausedTo фиксируем по реальной дате возврата, а не по дате клика.
 * pausedFrom не трогаем — остаётся историей интервала заморозки.
 * Списание за текущий месяц не запускаем здесь — им занимается обычный
 * ежемесячный биллинг-ран, как для любой активной записи.
 * @param {Object} props
 * @param {Object|null} props.enrollment запись со статусом paused, или null (закрыто)
 * @param {() => void} props.onClose
 */
export function UnfreezeEnrollmentModal({ enrollment, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [resumedFrom, setResumedFrom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (enrollment) setResumedFrom(format(new Date(), 'yyyy-MM-dd'));
  }, [enrollment]);

  const pausedFromDate = enrollment?.pausedFrom?.toDate?.();
  const resumedFromDate = resumedFrom ? new Date(`${resumedFrom}T00:00:00`) : null;
  const dateBeforeFreezeStart = Boolean(pausedFromDate && resumedFromDate && resumedFromDate < pausedFromDate);

  const handleConfirm = async () => {
    if (!resumedFrom || dateBeforeFreezeStart) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        status: 'active',
        statusLabel: 'Активен (Оплачивает обучение)',
        pausedTo: Timestamp.fromDate(resumedFromDate),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await recomputeStudentAggregates(db, enrollment.studentId);
      await logActivity(
        db,
        { entityType: 'group', entityId: enrollment.groupId, action: 'enrollment_unfrozen', field: 'status', before: 'paused', after: 'active' },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );
      showToast('Заморозка снята.');
      onClose();
    } catch {
      showToast('Не удалось снять заморозку.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Снять заморозку"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} loading={saving} disabled={!resumedFrom || dateBeforeFreezeStart}>
            Активировать
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-text">
          Снять заморозку записи «{enrollment?.groupCode}»? Укажите дату, с которой студент фактически вернулся на занятия —
          студент вернётся в статус «Активен».
        </p>
        <DatePicker label="Дата возобновления" required value={resumedFrom} onChange={(e) => setResumedFrom(e.target.value)} />
        {dateBeforeFreezeStart && (
          <p className="rounded-field bg-danger/5 p-3 text-[13px] text-danger">
            Дата возобновления не может быть раньше начала заморозки ({format(pausedFromDate, 'dd.MM.yyyy')}).
          </p>
        )}
      </div>
    </Modal>
  );
}
