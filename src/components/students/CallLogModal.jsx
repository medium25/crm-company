import { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Input } from '../ui/Input.jsx';

const DIRECTION_OPTIONS = [
  { value: 'out', label: 'Исходящий' },
  { value: 'in', label: 'Входящий' },
];

const RESULT_OPTIONS = [
  { value: 'reached', label: 'Дозвонились' },
  { value: 'no_answer', label: 'Не ответил' },
  { value: 'busy', label: 'Занято' },
  { value: 'wrong_number', label: 'Неверный номер' },
];

/**
 * Лог звонка — «callLogs», P1 (раздел 02). `open` управляет видимостью,
 * `studentId`/`studentName` — кому звонили.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {string} props.studentId
 * @param {() => void} props.onClose
 */
export function CallLogModal({ open, studentId, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [direction, setDirection] = useState('out');
  const [result, setResult] = useState('reached');
  const [durationSec, setDurationSec] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, 'callLogs'), {
        studentId,
        direction,
        result,
        comment,
        durationSec: Number(durationSec) || 0,
        userId: user.uid,
        userName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      showToast('Звонок записан.');
      setDirection('out');
      setResult('reached');
      setDurationSec('');
      setComment('');
      onClose();
    } catch {
      showToast('Не удалось записать звонок.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Записать звонок"
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select label="Направление" options={DIRECTION_OPTIONS} value={direction} onChange={(e) => setDirection(e.target.value)} />
        <Select label="Результат" options={RESULT_OPTIONS} value={result} onChange={(e) => setResult(e.target.value)} />
        <Input label="Длительность (сек)" type="number" min="0" value={durationSec} onChange={(e) => setDurationSec(e.target.value)} />
        <Input label="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
      </form>
    </Modal>
  );
}
