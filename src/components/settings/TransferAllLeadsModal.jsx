import { useEffect, useState } from 'react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { getActiveLeadIdsForOperator, reassignLeadsToOperator } from '../../lib/leadFunnel.js';

/**
 * Перевод ВСЕХ активных лидов оператора другому — без разворота списка
 * (кнопка «Перевести все лиды» в меню действий строки оператора).
 * @param {Object} props
 * @param {{id: string, fullName: string}|null} props.operator оператор-источник, null — закрыто
 * @param {Array<{id: string, fullName: string}>} props.operators все операторы для выбора получателя (источник исключается внутри)
 * @param {() => void} props.onClose
 * @param {() => void} [props.onTransferred] вызывается после успешного перевода — родитель пересчитывает счётчики «Сейчас лидов»
 */
export function TransferAllLeadsModal({ operator, operators, onClose, onTransferred }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [targetId, setTargetId] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    if (operator) setTargetId('');
  }, [operator]);

  const targetOptions = operators.filter((op) => op.id !== operator?.id);

  const handleTransfer = async () => {
    if (!targetId || !operator) return;
    setTransferring(true);
    try {
      const leadIds = await getActiveLeadIdsForOperator(db, operator.id, activeBranchId);
      if (leadIds.length === 0) {
        showToast('У оператора нет активных лидов.');
        onClose();
        return;
      }
      await reassignLeadsToOperator(db, leadIds, targetId, user);
      showToast(`Переведено лидов: ${leadIds.length}.`);
      onTransferred?.();
      onClose();
    } catch {
      showToast('Не удалось перевести лиды.', { type: 'error' });
    } finally {
      setTransferring(false);
    }
  };

  return (
    <Modal
      open={Boolean(operator)}
      onClose={onClose}
      title={`Перевести все лиды: ${operator?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={transferring}>
            Отмена
          </Button>
          <Button onClick={handleTransfer} loading={transferring} disabled={!targetId}>
            Перевести
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-text">
          Все активные лиды оператора <b>{operator?.fullName}</b> (Новый лид, Дозвон, Пробный, Дожим) перейдут
          выбранному оператору. Стадия и прогресс по каждому лиду не меняются.
        </p>
        <Select
          label="Кому перевести"
          options={[{ value: '', label: 'Выбрать' }, ...targetOptions.map((op) => ({ value: op.id, label: op.fullName }))]}
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
        />
      </div>
    </Modal>
  );
}
