import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { updateTransaction } from '../../lib/billing.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Исправление автоматического/ручного списания (type: charge | correction) —
 * правит сумму/комментарий/дату существующей записи на месте, без
 * компенсирующих проводок. Только owner/accountant (гейт по роли — на
 * вызывающей стороне).
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object|null} props.transaction исходное списание
 * @param {() => void} props.onClose
 */
export function EditChargeModal({ open, transaction, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && transaction) {
      setAmount(String(Math.abs(transaction.amount)));
      setComment(transaction.comment || '');
      setDate(format(transaction.date.toDate(), 'yyyy-MM-dd'));
    }
  }, [open, transaction]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!transaction) return;
    setSaving(true);
    try {
      const sign = transaction.amount < 0 ? -1 : 1;
      const newAmount = sign * Math.abs(Number(amount));
      await updateTransaction(
        db,
        transaction,
        { amount: newAmount, comment, date: new Date(`${date}T00:00:00`) },
        { uid: user.uid },
      );
      showToast('Списание исправлено.');
      onClose();
    } catch {
      showToast('Не удалось исправить списание.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Исправить списание"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving} disabled={!amount}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Сумма" type="number" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Комментарий" required value={comment} onChange={(e) => setComment(e.target.value)} />
      </form>
    </Modal>
  );
}
