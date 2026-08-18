import { useEffect, useState } from 'react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { updateTransactionMethod } from '../../lib/billing.js';
import { PAYMENT_METHOD_OPTIONS } from '../../lib/format.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';

/**
 * Правит только способ оплаты уже существующей записи (type=payment) — не
 * трогает сумму/дату/баланс, отдельная лёгкая ручка `updateTransactionMethod`
 * без пересчёта агрегатов (в отличие от EditChargeModal/updateTransaction).
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object|null} props.transaction исходный платёж
 * @param {() => void} props.onClose
 */
export function EditPaymentMethodModal({ open, transaction, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && transaction) setMethod(transaction.method || 'cash');
  }, [open, transaction]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!transaction) return;
    setSaving(true);
    try {
      await updateTransactionMethod(db, transaction.id, method, { uid: user.uid });
      showToast('Способ оплаты изменён.');
      onClose();
    } catch {
      showToast('Не удалось изменить способ оплаты.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Способ оплаты"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Select label="Способ оплаты" options={PAYMENT_METHOD_OPTIONS} value={method} onChange={(e) => setMethod(e.target.value)} />
      </form>
    </Modal>
  );
}
