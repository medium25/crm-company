import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { recordMaterialPayment } from '../../lib/billing.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { MoneyInput } from '../ui/MoneyInput.jsx';
import { Select } from '../ui/Select.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { PAYMENT_METHOD_OPTIONS } from '../../lib/format.js';

/**
 * «Оплата учебных материалов» — разовый платёж (книги и т.п.), НЕ долг за
 * курс: баланс студента не меняется (см. recordMaterialPayment), но платёж
 * попадает в общий список поступлений в «Финансы». Замена практике заводить
 * отдельный служебный профиль-копилку под такие платежи.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object} props.student
 * @param {() => void} props.onClose
 */
export function MaterialPaymentModal({ open, student, onClose }) {
  const { user, staff } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setMethod('cash');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setComment('');
    }
  }, [open]);

  const amountNum = Number(amount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await recordMaterialPayment(
        db,
        { student, branchId: activeBranchId, amount: amountNum, method, date: new Date(`${date}T00:00:00`), comment },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );
      showToast('Оплата материалов сохранена.');
      onClose();
    } catch {
      showToast('Не удалось сохранить оплату.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Оплата учебных материалов"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!amountNum}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <MoneyInput label="Сумма" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select label="Метод оплаты" options={PAYMENT_METHOD_OPTIONS} value={method} onChange={(e) => setMethod(e.target.value)} />
        <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Комментарий" placeholder="Например: учебник" value={comment} onChange={(e) => setComment(e.target.value)} />
        <p className="text-[13px] text-muted">Не влияет на баланс студента — только на общую выручку в «Финансы».</p>
      </form>
    </Modal>
  );
}
