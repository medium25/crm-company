import { useState } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, orderBy } from 'firebase/firestore';
import { db, firebaseConfig } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';

const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'admin', label: 'Администратор' },
  { value: 'teacher', label: 'Учитель' },
];

const teachersQuery = db ? query(collection(db, 'teachers'), where('isArchived', '==', false), orderBy('displayName')) : null;

/**
 * Заводит нового сотрудника: Firebase Auth аккаунт (email/пароль) + staff-
 * документ одним кликом. Создание через отдельный, временный instance
 * Firebase App — иначе createUserWithEmailAndPassword переключил бы текущую
 * сессию (owner/CEO) на новый аккаунт. Инстанс удаляется сразу после.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 */
export function AddStaffModal({ open, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const { data: teachers } = useCollection(teachersQuery);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('teacher');
  const [teacherId, setTeacherId] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFullName('');
    setEmail('');
    setPassword('');
    setRole('teacher');
    setTeacherId('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const tempApp = initializeApp(firebaseConfig, `staff-create-${Date.now()}`);
    try {
      const tempAuth = getAuth(tempApp);
      const { user: newUser } = await createUserWithEmailAndPassword(tempAuth, email, password);

      await setDoc(doc(db, 'staff', newUser.uid), {
        fullName,
        phone: '',
        email,
        role,
        branchIds: activeBranchId ? [activeBranchId] : [],
        teacherId: role === 'teacher' ? teacherId || null : null,
        isActive: true,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      });

      showToast('Сотрудник добавлен.');
      handleClose();
    } catch (err) {
      const message =
        err.code === 'auth/email-already-in-use' ? 'Такой email уже используется.' :
        err.code === 'auth/weak-password' ? 'Пароль слишком короткий (минимум 6 символов).' :
        'Не удалось добавить сотрудника.';
      showToast(message, { type: 'error' });
    } finally {
      await deleteApp(tempApp);
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
          <Button onClick={handleSubmit} loading={saving} disabled={!fullName || !email || !password}>
            Добавить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Имя" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Пароль"
          type="text"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Select label="Должность" options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value)} />
        {role === 'teacher' && (
          <Select
            label="Учитель (карточка)"
            options={[{ value: '', label: 'Не привязывать' }, ...teachers.map((t) => ({ value: t.id, label: t.displayName }))]}
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          />
        )}
        <p className="text-[13px] text-muted">
          Пароль вводишь ты сам и сообщаешь сотруднику лично (по SMS/мессенджеру) — восстановления по email нет.
        </p>
      </form>
    </Modal>
  );
}
