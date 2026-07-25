import { useState } from 'react';
import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { logActivity } from '../../lib/activityLog.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Заморозка записи — списания прекращаются со дня заморозки (реализация
 * списаний — фаза 5, здесь только фиксация дат).
 * @param {Object} props
 * @param {Object|null} props.enrollment
 * @param {() => void} props.onClose
 */
export function FreezeEnrollmentModal({ enrollment, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [pausedFrom, setPausedFrom] = useState('');
  const [pausedTo, setPausedTo] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        status: 'paused',
        pausedFrom: Timestamp.fromDate(new Date(`${pausedFrom}T00:00:00`)),
        pausedTo: pausedTo ? Timestamp.fromDate(new Date(`${pausedTo}T00:00:00`)) : null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
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
          <Button onClick={handleSubmit} loading={saving} disabled={!pausedFrom}>
            Заморозить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DatePicker label="С" required value={pausedFrom} onChange={(e) => setPausedFrom(e.target.value)} />
        <DatePicker label="По (необязательно)" value={pausedTo} onChange={(e) => setPausedTo(e.target.value)} />
      </form>
    </Modal>
  );
}
