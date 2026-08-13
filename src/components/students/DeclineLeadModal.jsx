import { useState } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';

/**
 * «Отказ» лида — причина строго из фиксированного списка
 * (2026-08-13-leads-funnel-redesign.md §7), свободный текст не допускается.
 * `lead` = null (закрыто) или сущность.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function DeclineLeadModal({ lead, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState(LOST_REASON_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await advanceStage(
        db,
        lead,
        'lost',
        {
          status: 'archived',
          statusReason: LOST_REASON_OPTIONS.find((o) => o.value === reason)?.label ?? reason,
          lostReason: reason,
          lostAt: serverTimestamp(),
          isArchived: true,
          archivedAt: serverTimestamp(),
        },
        user,
      );
      showToast('Лид отклонён.');
      setReason(LOST_REASON_OPTIONS[0].value);
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
        <Select label="Причина" required options={LOST_REASON_OPTIONS} value={reason} onChange={(e) => setReason(e.target.value)} />
      </form>
    </Modal>
  );
}
