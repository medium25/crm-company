import { useEffect, useState } from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp, collection, query, where, orderBy } from 'firebase/firestore';
import { db, firebaseConfig } from '../../firebase.js';
import { phoneToAuthEmail } from '../../lib/auth.js';
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

const localPhone = (phone) => (phone ?? '').replace(/\D/g, '').replace(/^998/, '');

/**
 * Заводит нового сотрудника (Firebase Auth аккаунт по номеру телефона,
 * без SMS — логин это {998+номер}@icon-crm.local, пароль по умолчанию
 * равен номеру без 998) или правит существующего.
 *
 * Создание через отдельный, временный instance Firebase App — иначе
 * createUserWithEmailAndPassword переключил бы текущую сессию (owner/CEO)
 * на новый аккаунт. Инстанс удаляется сразу после.
 *
 * Редактирование правит только staff-документ (имя/роль/привязка к
 * учителю) — номер телефона (= логин) сменить нельзя без нового аккаунта,
 * Firebase Auth не даёт менять email существующего пользователя без
 * подтверждения по почте, а для синтетического адреса подтверждать нечем.
 * @param {Object} props
 * @param {Object|null} props.member null — закрыто, {} — создание, сущность — редактирование
 * @param {() => void} props.onClose
 */
export function AddStaffModal({ member, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const { data: teachers } = useCollection(teachersQuery);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordEdited, setPasswordEdited] = useState(false);
  const [role, setRole] = useState('teacher');
  const [teacherId, setTeacherId] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(member?.id);

  useEffect(() => {
    if (!member) return;
    setFullName(member.fullName ?? '');
    setPhone(localPhone(member.phone));
    setPassword('');
    setPasswordEdited(false);
    setRole(member.role ?? 'teacher');
    setTeacherId(member.teacherId ?? '');
  }, [member]);

  const reset = () => {
    setFullName('');
    setPhone('');
    setPassword('');
    setPasswordEdited(false);
    setRole('teacher');
    setTeacherId('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePhoneChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    setPhone(digits);
    if (!passwordEdited) setPassword(digits);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await updateDoc(doc(db, 'staff', member.id), {
          fullName,
          role,
          teacherId: role === 'teacher' ? teacherId || null : null,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        showToast('Сотрудник обновлён.');
        handleClose();
        return;
      }

      const fullPhone = `998${phone}`;
      const authEmail = phoneToAuthEmail(fullPhone);
      const tempApp = initializeApp(firebaseConfig, `staff-create-${Date.now()}`);
      try {
        const tempAuth = getAuth(tempApp);
        const { user: newUser } = await createUserWithEmailAndPassword(tempAuth, authEmail, password);

        try {
          await setDoc(doc(db, 'staff', newUser.uid), {
            fullName,
            phone: fullPhone,
            email: '',
            role,
            branchIds: activeBranchId ? [activeBranchId] : [],
            teacherId: role === 'teacher' ? teacherId || null : null,
            isActive: true,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
          });
        } catch (docErr) {
          // Auth-аккаунт создан, а staff-документ — нет: без отката сотрудник
          // залогинится в аккаунт без доступа ("Доступ не выдан"). Убираем сирота-аккаунт.
          await deleteUser(newUser).catch(() => {});
          throw docErr;
        }

        showToast('Сотрудник добавлен.');
        handleClose();
      } finally {
        await deleteApp(tempApp);
      }
    } catch (err) {
      const message =
        err.code === 'auth/email-already-in-use' ? 'Такой номер телефона уже используется.' :
        err.code === 'auth/weak-password' ? 'Пароль слишком короткий (минимум 6 символов).' :
        isEdit ? 'Не удалось сохранить изменения.' : 'Не удалось добавить сотрудника.';
      showToast(message, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(member)}
      onClose={handleClose}
      title={isEdit ? 'Редактировать сотрудника' : 'Добавить сотрудника'}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={!fullName || (!isEdit && (!phone || phone.length < 9 || !password))}
          >
            {isEdit ? 'Сохранить' : 'Добавить'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Имя" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <Select label="Должность" options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value)} />

        {isEdit ? (
          <Input label="Телефон (логин)" value={`+998 ${phone}`} disabled />
        ) : (
          <label className="block">
            <span className="mb-1 block text-[13px] text-muted">Телефон</span>
            <span className="flex items-center gap-2">
              <span className="flex h-11 shrink-0 items-center rounded-field border border-border-strong bg-surface-alt px-3 text-[15px] text-muted">
                +998
              </span>
              <input
                type="tel"
                placeholder="901234567"
                required
                maxLength={9}
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="h-11 w-full rounded-field border border-border-strong bg-white px-3 text-[15px] text-text placeholder:text-muted focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
              />
            </span>
          </label>
        )}

        {!isEdit && (
          <Input
            label="Пароль"
            type="text"
            required
            minLength={6}
            value={password}
            onChange={(e) => {
              setPasswordEdited(true);
              setPassword(e.target.value);
            }}
          />
        )}

        {role === 'teacher' && (
          <Select
            label="Учитель (карточка)"
            options={[{ value: '', label: 'Не привязывать' }, ...teachers.map((t) => ({ value: t.id, label: t.displayName }))]}
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
          />
        )}

        {!isEdit && (
          <p className="text-[13px] text-muted">
            Вход — по этому номеру телефона и паролю, без SMS-кода. Пароль по умолчанию — сам номер, можно
            поменять здесь. Сообщи сотруднику лично.
          </p>
        )}
        {isEdit && (
          <p className="text-[13px] text-muted">Номер телефона (логин) сменить нельзя — удали сотрудника и заведи заново.</p>
        )}
      </form>
    </Modal>
  );
}
