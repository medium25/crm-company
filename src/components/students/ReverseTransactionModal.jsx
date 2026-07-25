import { useState } from 'react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { reverseTransaction } from '../../lib/billing.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { formatDate, formatMoney } from '../../lib/format.js';

/**
 * Сторно — гасит выбранную транзакцию встречной записью. Только owner/accountant.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Array<Object>} props.transactions транзакции студента, доступные к сторно
 * @param {() => void} props.onClose
 */
export function ReverseTransactionModal({ open, transactions, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [txId, setTxId] = useState('');
  const [saving, setSaving] = useState(false);

  const reversible = transactions.filter((t) => !t.isReversed && !t.id.startsWith('rev_'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    const original = reversible.find((t) => t.id === txId);
    if (!original) return;
    setSaving(true);
    try {
      await reverseTransaction(db, original, { uid: user.uid, fullName: staff?.fullName ?? '' });
      showToast('Транзакция сторнирована.');
      onClose();
    } catch {
      showToast('Не удалось сторнировать транзакцию.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Сторно"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving} disabled={!txId}>
            Сторнировать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <Select
          label="Транзакция"
          required
          options={[
            { value: '', label: 'Выбрать' },
            ...reversible.map((t) => ({
              value: t.id,
              label: `${formatDate(t.date)} · ${formatMoney(t.amount)} · ${t.comment || t.type}`,
            })),
          ]}
          value={txId}
          onChange={(e) => setTxId(e.target.value)}
        />
      </form>
    </Modal>
  );
}
