import { useEffect, useState } from 'react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

const DELETE_PASSWORD = '1223';

/**
 * Полное (не soft-delete) удаление лида — только для status=='lead' (см.
 * firestore.rules, реальных студентов с историей платежей так удалить
 * нельзя). Пароль тут — НЕ защита: значение лежит прямо в этом файле,
 * который приходит в браузер как есть, любой через DevTools его достанет
 * за секунды. Это просто лишний осознанный шаг перед необратимым действием,
 * чтобы не удалить лида случайным кликом.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function DeleteLeadModal({ lead, onClose }) {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!lead) setPassword('');
  }, [lead]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== DELETE_PASSWORD) {
      showToast('Неверный пароль.', { type: 'error' });
      return;
    }
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'students', lead.id));
      showToast('Лид удалён навсегда.');
      onClose();
    } catch {
      showToast('Не удалось удалить — возможно, у лида уже есть записи в группу (тогда доступно только «Отказ»/архивация).', {
        type: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={Boolean(lead)}
      onClose={onClose}
      title={`Удалить навсегда: ${lead?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={deleting} disabled={!password}>
            Удалить навсегда
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[15px] text-text">
          Это <b>полностью и без возврата</b> удалит карточку лида «{lead?.fullName}» — не архивация, восстановить
          будет нельзя.
        </p>
        <Input
          label="Пароль"
          type="password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </form>
    </Modal>
  );
}
