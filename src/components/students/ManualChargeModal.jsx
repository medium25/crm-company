import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { recordManualCharge } from '../../lib/billing.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Ручное списание — только owner/accountant (гейт по роли — на вызывающей стороне).
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object} props.student
 * @param {() => void} props.onClose
 */
export function ManualChargeModal({ open, student, onClose }) {
  const { user, staff } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setComment('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await recordManualCharge(
        db,
        { student, branchId: activeBranchId, amount: Number(amount), comment, date: new Date(`${date}T00:00:00`) },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );
      showToast('Списание сохранено.');
      onClose();
    } catch {
      showToast('Не удалось сохранить списание.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ручное списание"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving} disabled={!amount}>
            Списать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Сумма" type="number" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Причина" required value={comment} onChange={(e) => setComment(e.target.value)} />
      </form>
    </Modal>
  );
}
