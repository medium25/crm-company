import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { reverseTransaction, recordManualCharge } from '../../lib/billing.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Исправление автоматического/ручного списания (type: charge | correction) —
 * транзакции неизменяемы («03 · Бизнес-логика»), поэтому «редактирование» —
 * это сторно старой записи + новая с исправленной суммой/комментарием одной
 * кнопкой. Только owner/accountant (гейт по роли — на вызывающей стороне).
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object} props.student
 * @param {Object|null} props.transaction исходное списание
 * @param {() => void} props.onClose
 */
export function EditChargeModal({ open, student, transaction, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && transaction) {
      setAmount(String(Math.abs(transaction.amount)));
      setComment(transaction.comment || '');
      setDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open, transaction]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!transaction) return;
    setSaving(true);
    try {
      const actingUser = { uid: user.uid, fullName: staff?.fullName ?? '' };
      if (!transaction.isReversed) {
        await reverseTransaction(db, transaction, actingUser);
      }
      const newAmount = Number(amount);
      if (newAmount > 0) {
        await recordManualCharge(
          db,
          { student, branchId: transaction.branchId, amount: newAmount, comment, date: new Date(`${date}T00:00:00`) },
          actingUser,
        );
      }
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
        <p className="text-[13px] text-muted">
          Старая запись сторнируется, вместо неё создаётся новая с указанными ниже суммой и комментарием.
        </p>
        <Input label="Сумма" type="number" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <DatePicker label="Дата новой записи" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Комментарий" required value={comment} onChange={(e) => setComment(e.target.value)} />
      </form>
    </Modal>
  );
}
