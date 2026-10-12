import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { EVALUATION_PALETTE } from '../../lib/colors.js';
import { operatorInitials } from '../leads/LeadCard.jsx';

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
  const [color, setColor] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFullName('');
    setTitle('');
    setColor(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName.trim() || !title.trim() || !color) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'evaluationStaff'), {
        fullName: fullName.trim(),
        title: title.trim(),
        color,
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
          <Button onClick={handleSubmit} loading={saving} disabled={!fullName.trim() || !title.trim() || !color}>
            Добавить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Имя" placeholder="Shahnoza Yusupova" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Звание" placeholder="Маркетолог" required value={title} onChange={(e) => setTitle(e.target.value)} />
        <div>
          <p className="mb-2 text-small text-muted">Цвет</p>
          <div className="grid grid-cols-10 gap-2">
            {EVALUATION_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${color === c ? 'ring-2 ring-navy ring-offset-2' : 'hover:scale-110'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          {color && (
            <span className="mt-3 flex items-center gap-2 text-small text-muted">
              Так будет выглядеть:
              <span className="flex h-9 w-9 items-center justify-center rounded-row font-bold" style={{ backgroundColor: `${color}26`, color }}>
                {operatorInitials(fullName) || '?'}
              </span>
            </span>
          )}
        </div>
        <p className="text-small text-muted">Без логина в CRM — только чтобы его можно было оценить здесь.</p>
      </form>
    </Modal>
  );
}
