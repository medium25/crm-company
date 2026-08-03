import { useMemo, useState } from 'react';
import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { chargePartialMonth } from '../../lib/billing.js';
import { logActivity } from '../../lib/activityLog.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Перевод записи из «Пробный» в «Активен» — trial → active («03 · Бизнес-логика»
 * §1). Запускает частичное списание за остаток месяца от даты активации
 * (§3.2), как и «Добавить в группу» со статусом «Активный» сразу. Группу
 * подгружает сама по `enrollment.groupId` — вызывающая сторона (карточка
 * группы уже её знает, карточка студента — нет) передаёт только запись и
 * минимальные данные студента.
 * @param {Object} props
 * @param {Object|null} props.enrollment запись со статусом trial, или null (закрыто)
 * @param {{id: string, fullName: string}} props.student
 * @param {() => void} props.onClose
 */
export function ActivateEnrollmentModal({ enrollment, student, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const groupRef = useMemo(() => (db && enrollment ? doc(db, 'groups', enrollment.groupId) : null), [enrollment]);
  const { data: group } = useDoc(groupRef);
  const [activatedAt, setActivatedAt] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const activatedAtTs = Timestamp.fromDate(new Date(`${activatedAt}T00:00:00`));

      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        status: 'active',
        statusLabel: 'Активен (Оплачивает обучение)',
        activatedAt: activatedAtTs,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await recomputeStudentAggregates(db, enrollment.studentId);
      await logActivity(
        db,
        { entityType: 'group', entityId: group.id, action: 'enrollment_activated', field: 'status', before: 'trial', after: 'active' },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );
      await chargePartialMonth(
        db,
        { student, enrollment: { ...enrollment, activatedAt: activatedAtTs }, group },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );

      showToast('Студент активирован.');
      onClose();
    } catch {
      showToast('Не удалось активировать запись.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Активировать запись"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!activatedAt || !group}>
            Активировать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[15px] text-text">
          Студент <b>{enrollment?.studentName}</b> перейдёт в статус «Активен» — стартует списание за обучение.
        </p>
        <DatePicker label="Дата активации" required value={activatedAt} onChange={(e) => setActivatedAt(e.target.value)} />
      </form>
    </Modal>
  );
}
