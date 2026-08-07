import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { recordPayment } from '../../lib/billing.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { MoneyInput } from '../ui/MoneyInput.jsx';
import { Select } from '../ui/Select.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { formatMethod, formatMoney, PAYMENT_METHOD_OPTIONS } from '../../lib/format.js';

/**
 * «Добавить оплату» — с превью нового баланса до сохранения.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object} props.student
 * @param {Array<Object>} props.enrollments записи студента — для выбора группы, если их больше одной
 * @param {() => void} props.onClose
 */
export function AddPaymentModal({ open, student, enrollments, onClose }) {
  const { user, staff } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [groupId, setGroupId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount('');
      setMethod('cash');
      setGroupId('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setComment('');
      setConfirming(false);
    }
  }, [open]);

  const amountNum = Number(amount) || 0;
  const balanceAfter = (student?.balance ?? 0) + amountNum;
  const activeEnrollments = enrollments.filter((e) => e.status !== 'left' && e.status !== 'archived');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const enrollment = activeEnrollments.find((en) => en.groupId === groupId);
      await recordPayment(
        db,
        {
          student,
          branchId: activeBranchId,
          amount: amountNum,
          method,
          date: new Date(`${date}T00:00:00`),
          comment,
          groupId: enrollment?.groupId ?? null,
          groupCode: enrollment?.groupCode ?? null,
        },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );
      showToast('Оплата сохранена.', { actionLabel: 'Распечатать', onAction: () => showToast('Печать появится в фазе 7.') });
      setConfirming(false);
      onClose();
    } catch {
      showToast('Не удалось сохранить оплату.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const selectedEnrollment = activeEnrollments.find((en) => en.groupId === groupId);
  const confirmMessage =
    `${student?.fullName ?? ''}: оплата ${formatMoney(amountNum)} (${formatMethod(method)}), ` +
    `дата ${format(new Date(`${date}T00:00:00`), 'dd.MM.yyyy')}` +
    `${selectedEnrollment ? `, группа ${selectedEnrollment.groupCode}` : ''}` +
    `${comment ? `, комментарий: «${comment}»` : ''}. ` +
    `Баланс после оплаты: ${formatMoney(balanceAfter)}.`;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Добавить оплату"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={() => setConfirming(true)} disabled={!amountNum}>
              Сохранить
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => { e.preventDefault(); setConfirming(true); }} className="flex flex-col gap-4">
          <MoneyInput label="Сумма" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Метод оплаты" options={PAYMENT_METHOD_OPTIONS} value={method} onChange={(e) => setMethod(e.target.value)} />
          {activeEnrollments.length > 1 && (
            <Select
              label="Группа"
              options={[{ value: '', label: 'Не привязана' }, ...activeEnrollments.map((en) => ({ value: en.groupId, label: en.groupCode }))]}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          )}
          <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />

          <p className="text-[15px] text-muted">
            Баланс после оплаты:{' '}
            <span className={balanceAfter < 0 ? 'font-bold text-danger' : 'font-bold text-success'}>{formatMoney(balanceAfter)}</span>
          </p>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleSubmit}
        loading={saving}
        title="Подтвердить оплату"
        message={confirmMessage}
        confirmLabel="Оплатить"
      />
    </>
  );
}
