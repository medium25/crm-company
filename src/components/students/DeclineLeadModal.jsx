import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

/**
 * «Отказ» лида — с причиной. `lead` = null (закрыто) или сущность.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function DeclineLeadModal({ lead, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'students', lead.id), {
        status: 'archived',
        statusReason: reason.trim(),
        isArchived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast('Лид отклонён.');
      onClose();
    } catch {
      showToast('Не удалось сохранить отказ.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(lead)}
      onClose={onClose}
      title={`Отказ: ${lead?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving}>
            Отказать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Input label="Причина" required value={reason} onChange={(e) => setReason(e.target.value)} />
      </form>
    </Modal>
  );
}
