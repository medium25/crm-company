import { useEffect, useState } from 'react';
import { doc, updateDoc, Timestamp, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

// Мягкий стоп-кран от случайной правки, не настоящая авторизация (запись и
// так доступна только isAdmin через Firestore rules) — пароль намеренно
// зашит в клиент.
const FREEZE_END_PASSWORD = '1223';

/**
 * Правит дату окончания уже оформленной заморозки (pausedTo) — в отличие от
 * даты начала (EditFreezeStartModal), требует пароль перед показом поля
 * даты: конец заморозки — более чувствительное поле (влияет на дедлайн и
 * цвет карточки), а при первой заморозке (FreezeEnrollmentModal) пароль не
 * нужен — сюда попадают только правки задним числом.
 * @param {Object} props
 * @param {Object|null} props.enrollment запись со статусом paused, или null (закрыто)
 * @param {() => void} props.onClose
 */
export function EditFreezeEndModal({ enrollment, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [step, setStep] = useState('password');
  const [password, setPassword] = useState('');
  const [pausedTo, setPausedTo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (enrollment) {
      setStep('password');
      setPassword('');
      setPausedTo(enrollment.pausedTo ? format(enrollment.pausedTo.toDate(), 'yyyy-MM-dd') : '');
    }
  }, [enrollment]);

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (password !== FREEZE_END_PASSWORD) {
      showToast('Неверный пароль.', { type: 'error' });
      return;
    }
    setStep('date');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!enrollment) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'enrollments', enrollment.id), {
        pausedTo: Timestamp.fromDate(new Date(`${pausedTo}T00:00:00`)),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast('Дата окончания заморозки изменена.');
      onClose();
    } catch {
      showToast('Не удалось изменить дату.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Дата окончания заморозки"
      footer={
        step === 'password' ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={handlePasswordSubmit} disabled={!password}>
              Продолжить
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Отмена
            </Button>
            <Button onClick={handleSubmit} loading={saving} disabled={!pausedTo}>
              Сохранить
            </Button>
          </>
        )
      }
    >
      {step === 'password' ? (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">Изменение даты окончания заморозки требует пароль.</p>
          <Input
            label="Пароль"
            type="password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DatePicker label="По" required value={pausedTo} onChange={(e) => setPausedTo(e.target.value)} />
        </form>
      )}
    </Modal>
  );
}
