import { useState } from 'react';
import { doc, getDoc, updateDoc, increment, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { chargeLeaveCorrection } from '../../lib/billing.js';
import { logActivity } from '../../lib/activityLog.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { Input } from '../ui/Input.jsx';

/**
 * Вывод студента из группы — записывает дату и причину, group.studentsCount −1.
 * @param {Object} props
 * @param {Object|null} props.enrollment
 * @param {() => void} props.onClose
 */
export function LeaveGroupModal({ enrollment, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [leftAt, setLeftAt] = useState('');
  const [leftReason, setLeftReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const leftAtDate = new Date(`${leftAt}T00:00:00`);

      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        status: 'left',
        leftAt: Timestamp.fromDate(leftAtDate),
        leftReason: leftReason.trim(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await updateDoc(doc(db, 'groups', enrollment.groupId), { studentsCount: increment(-1) });
      await recomputeStudentAggregates(db, enrollment.studentId);
      await logActivity(
        db,
        { entityType: 'group', entityId: enrollment.groupId, action: 'enrollment_left', field: 'studentsCount', before: enrollment.studentName, after: leftReason.trim() },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );

      if (enrollment.status === 'active') {
        const groupSnap = await getDoc(doc(db, 'groups', enrollment.groupId));
        if (groupSnap.exists()) {
          await chargeLeaveCorrection(
            db,
            {
              student: { id: enrollment.studentId, fullName: enrollment.studentName },
              enrollment,
              group: { id: groupSnap.id, ...groupSnap.data() },
              leftAt: leftAtDate,
            },
            { uid: user.uid, fullName: staff?.fullName ?? '' },
          );
        }
      }

      showToast('Студент выведен из группы.');
      onClose();
    } catch {
      showToast('Не удалось вывести из группы.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Вывести из группы"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving} disabled={!leftAt}>
            Вывести
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DatePicker label="Дата ухода" required value={leftAt} onChange={(e) => setLeftAt(e.target.value)} />
        <Input label="Причина" value={leftReason} onChange={(e) => setLeftReason(e.target.value)} />
      </form>
    </Modal>
  );
}
