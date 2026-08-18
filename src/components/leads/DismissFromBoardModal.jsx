import { useEffect, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

const ACCESS_CODE = '1223';

/**
 * Снятие «Оплачено»-карточки с доски (не удаление студента, просто
 * скрыть уведомление). Код доступа — не настоящая защита, просто
 * защита от случайного клика по крестику.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function DismissFromBoardModal({ lead, onClose }) {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setCode('');
      setError('');
    }
  }, [lead]);

  if (!lead) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code !== ACCESS_CODE) {
      setError('Неверный код доступа.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'students', lead.id), { boardHiddenAt: serverTimestamp() });
      showToast(`${lead.fullName}: убрано с доски.`);
      onClose();
    } catch {
      showToast('Не удалось убрать с доски.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(lead)}
      onClose={onClose}
      title={`Убрать с доски: ${lead.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving}>
            Убрать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[13px] text-muted">Карточка исчезнет с доски «Оплачено». Студент остаётся в системе.</p>
        <Input
          label="Код доступа"
          type="password"
          required
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError('');
          }}
          error={error}
        />
      </form>
    </Modal>
  );
}
