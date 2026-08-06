import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { logActivity } from '../../lib/activityLog.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';

/**
 * Снятие заморозки — запись возвращается в «Активен», даты заморозки
 * очищаются. Списание за текущий месяц не запускаем здесь — им занимается
 * обычный ежемесячный биллинг-ран, как для любой активной записи.
 * @param {Object} props
 * @param {Object|null} props.enrollment запись со статусом paused, или null (закрыто)
 * @param {() => void} props.onClose
 */
export function UnfreezeEnrollmentModal({ enrollment, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        status: 'active',
        statusLabel: 'Активен (Оплачивает обучение)',
        pausedFrom: null,
        pausedTo: null,
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
    <ConfirmDialog
      open={Boolean(enrollment)}
      onClose={onClose}
      onConfirm={handleConfirm}
      loading={saving}
      title="Снять заморозку"
      message={`Снять заморозку записи «${enrollment?.groupCode}»? Студент вернётся в статус «Активен».`}
      confirmLabel="Активировать"
    />
  );
}
