import { useEffect, useState } from 'react';
import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Правит дату начала уже оформленной заморозки (pausedFrom) — например,
 * если её ввели задним числом с ошибкой. На pausedTo/статус не влияет.
 * @param {Object} props
 * @param {Object|null} props.enrollment запись со статусом paused, или null (закрыто)
 * @param {() => void} props.onClose
 */
export function EditFreezeStartModal({ enrollment, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [pausedFrom, setPausedFrom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (enrollment?.pausedFrom) setPausedFrom(format(enrollment.pausedFrom.toDate(), 'yyyy-MM-dd'));
  }, [enrollment]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!enrollment) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        pausedFrom: Timestamp.fromDate(new Date(`${pausedFrom}T00:00:00`)),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast('Дата начала заморозки изменена.');
      onClose();
    } catch {
      showToast('Не удалось изменить дату.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Дата начала заморозки"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!pausedFrom}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <DatePicker label="С" required value={pausedFrom} onChange={(e) => setPausedFrom(e.target.value)} />
      </form>
    </Modal>
  );
}
