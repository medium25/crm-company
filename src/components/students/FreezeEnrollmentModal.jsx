import { useState } from 'react';
import { doc, updateDoc, increment, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { logActivity } from '../../lib/activityLog.js';
import { MIN_FREEZE_BALANCE, MAX_FREEZES_PER_STUDENT, canFreezeStudent } from '../../lib/billing.js';
import { formatMoney } from '../../lib/format.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Заморозка записи — списания прекращаются со дня заморозки (реализация
 * списаний — фаза 5, здесь только фиксация дат). Разрешена только при
 * balance >= MIN_FREEZE_BALANCE и freezeCount < MAX_FREEZES_PER_STUDENT
 * (гейт на кнопке в EnrollmentCard/RosterRow, здесь — повторная проверка на
 * случай прямого открытия модалки). freezeCount — счётчик на students,
 * общий на весь срок обучения, а не на конкретную запись.
 * @param {Object} props
 * @param {Object|null} props.enrollment
 * @param {number} props.studentBalance
 * @param {number} [props.studentFreezeCount]
 * @param {() => void} props.onClose
 */
export function FreezeEnrollmentModal({ enrollment, studentBalance, studentFreezeCount, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [pausedFrom, setPausedFrom] = useState('');
  const [pausedTo, setPausedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const canFreeze = canFreezeStudent({ balance: studentBalance, freezeCount: studentFreezeCount });
  const freezeLimitReached = (studentFreezeCount ?? 0) >= MAX_FREEZES_PER_STUDENT;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canFreeze) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        status: 'paused',
        pausedFrom: Timestamp.fromDate(new Date(`${pausedFrom}T00:00:00`)),
        pausedTo: Timestamp.fromDate(new Date(`${pausedTo}T00:00:00`)),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await updateDoc(doc(db, 'students', enrollment.studentId), {
        freezeCount: increment(1),
      });
      await recomputeStudentAggregates(db, enrollment.studentId);
      await logActivity(
        db,
        { entityType: 'group', entityId: enrollment.groupId, action: 'enrollment_paused', field: 'status', before: enrollment.status, after: 'paused' },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );
      showToast('Запись заморожена.');
      onClose();
    } catch {
      showToast('Не удалось заморозить запись.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Заморозить запись"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!canFreeze || !pausedFrom || !pausedTo}>
            Заморозить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {!canFreeze && freezeLimitReached && (
          <p className="rounded-field bg-danger/5 p-3 text-[13px] text-danger">
            Лимит заморозок за весь срок обучения исчерпан ({MAX_FREEZES_PER_STUDENT} из {MAX_FREEZES_PER_STUDENT}).
          </p>
        )}
        {!canFreeze && !freezeLimitReached && (
          <p className="rounded-field bg-danger/5 p-3 text-[13px] text-danger">
            Заморозка доступна только при балансе от {formatMoney(MIN_FREEZE_BALANCE)}. Текущий баланс: {formatMoney(studentBalance)}.
          </p>
        )}
        <DatePicker label="С" required value={pausedFrom} onChange={(e) => setPausedFrom(e.target.value)} />
        <DatePicker label="По" required value={pausedTo} onChange={(e) => setPausedTo(e.target.value)} />
      </form>
    </Modal>
  );
}
