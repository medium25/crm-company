import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

/**
 * Добавление человека в «Оценка сотрудников» без логина в CRM — для тех,
 * у кого ещё нет роли в системе (маркетолог, охранник и т.п.).
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 */
export function AddEvaluationPersonModal({ open, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFullName('');
    setTitle('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'evaluationStaff'), {
        fullName: fullName.trim(),
        title: title.trim(),
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });
      showToast('Сотрудник добавлен.');
      handleClose();
    } catch {
      showToast('Не удалось добавить сотрудника.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Добавить сотрудника"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!fullName.trim() || !title.trim()}>
            Добавить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Имя" placeholder="Shahnoza Yusupova" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Звание" placeholder="Маркетолог" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="text-small text-muted">Без логина в CRM — только чтобы его можно было оценить здесь.</p>
      </form>
    </Modal>
  );
}
