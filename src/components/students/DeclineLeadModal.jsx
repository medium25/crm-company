import { useState } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Input } from '../ui/Input.jsx';

/**
 * «Отказ» лида — причина строго из фиксированного списка
 * (2026-08-13-leads-funnel-redesign.md §7). Для причин с
 * `requiresDetail` (см. LOST_REASON_OPTIONS) оператор обязан ещё
 * вписать, что именно случилось — без этого текста отказать нельзя.
 * `lead` = null (закрыто) или сущность.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function DeclineLeadModal({ lead, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState(LOST_REASON_OPTIONS[0].value);
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedOption = LOST_REASON_OPTIONS.find((o) => o.value === reason);
  const detailRequired = Boolean(selectedOption?.requiresDetail);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (detailRequired && !detail.trim()) return;
    setSaving(true);
    try {
      await advanceStage(
        db,
        lead,
        'lost',
        {
          statusReason: detailRequired ? `${selectedOption.label} — ${detail.trim()}` : (selectedOption?.label ?? reason),
          lostReason: reason,
          lostReasonDetail: detailRequired ? detail.trim() : null,
          lostAt: serverTimestamp(),
        },
        user,
      );
      showToast('Лид отклонён.');
      setReason(LOST_REASON_OPTIONS[0].value);
      setDetail('');
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
          <Button variant="danger" onClick={handleSubmit} loading={saving} disabled={detailRequired && !detail.trim()}>
            Отказать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Причина"
          required
          options={LOST_REASON_OPTIONS}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setDetail('');
          }}
        />
        {detailRequired && (
          <Input
            label="Что именно случилось"
            required
            autoFocus
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Опишите причину своими словами"
          />
        )}
      </form>
    </Modal>
  );
}
