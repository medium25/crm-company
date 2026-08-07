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
import { MoneyInput } from '../ui/MoneyInput.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { formatMoney } from '../../lib/format.js';

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
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setComment('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setConfirming(false);
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
      setConfirming(false);
      onClose();
    } catch {
      showToast('Не удалось сохранить списание.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const confirmMessage = `${student?.fullName ?? ''}: списать ${formatMoney(Math.abs(Number(amount) || 0))}, дата ${date ? format(new Date(`${date}T00:00:00`), 'dd.MM.yyyy') : ''}, причина: «${comment}». Баланс уменьшится на эту сумму.`;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Ручное списание"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button variant="danger" onClick={() => setConfirming(true)} disabled={!amount || !comment}>
              Списать
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); setConfirming(true); }} className="flex flex-col gap-4">
          <MoneyInput label="Сумма" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Причина" required value={comment} onChange={(e) => setComment(e.target.value)} />
        </form>
      </Modal>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleSubmit}
        loading={saving}
        title="Подтвердить списание"
        message={confirmMessage}
        confirmLabel="Списать"
      />
    </>
  );
}
