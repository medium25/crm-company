import { useEffect, useState } from 'react';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { cascadeTeacherName, createTeacherWithStaffAccount } from '../../lib/teachers.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

const EMPTY_FORM = { displayName: '', fullName: '', phone: '', password: '' };

/**
 * Модалка добавления/редактирования учителя. `teacher` = null (закрыто),
 * {} (создание) или сущность (редактирование).
 * @param {Object} props
 * @param {Object|null} props.teacher
 * @param {() => void} props.onClose
 */
export function TeacherFormModal({ teacher, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [passwordEdited, setPasswordEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(teacher?.id);

  useEffect(() => {
    if (!teacher) return;
    setForm({
      displayName: teacher.displayName ?? '',
      fullName: teacher.fullName ?? '',
      phone: teacher.phone ?? '',
      password: '',
    });
    setPasswordEdited(false);
  }, [teacher]);

  const handlePhoneChange = (value) => {
    setForm((f) => ({ ...f, phone: value, password: passwordEdited ? f.password : value.replace(/\D/g, '') }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const displayName = form.displayName.trim();
      const fullName = form.fullName.trim();
      const phone = form.phone.replace(/\D/g, '');
      if (isEdit) {
        await updateDoc(doc(db, 'teachers', teacher.id), {
          displayName,
          fullName,
          phone,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        if (displayName !== teacher.displayName) {
          await cascadeTeacherName(db, teacher.id, displayName);
        }
        showToast('Учитель обновлён.');
      } else {
        // Тем же способом, что «Добавить сотрудника» в настройках — сразу и
        // профиль учителя (группы/расписание), и логин в CRM (роль 'teacher'),
        // связанные staffUid/teacherId. Иначе учитель, заведённый отсюда, не
        // попадает в «Сотрудники» и не может зайти (см. MS OSUDA, 2026-10-08).
        await createTeacherWithStaffAccount(db, { displayName, fullName, phone, password: form.password, activeBranchId }, user);
        showToast('Учитель добавлен — и профиль, и логин в CRM.');
      }
      onClose();
    } catch (err) {
      const message = err.code === 'auth/email-already-in-use' ? 'Такой номер телефона уже используется.' : 'Не удалось сохранить учителя.';
      showToast(message, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(teacher)}
      onClose={onClose}
      title={teacher?.id ? 'Редактировать учителя' : 'Добавить учителя'}
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
        <Input
          label="Отображаемое имя"
          placeholder="MR SANJAR"
          required
          value={form.displayName}
          onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
        />
        <Input
          label="Полное имя"
          placeholder="Sanjar Karimov"
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
        />
        <Input
          label="Телефон"
          placeholder="998901234567"
          required
          disabled={isEdit && Boolean(teacher?.staffUid)}
          value={form.phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
        />
        {!isEdit && (
          <>
            <Input
              label="Пароль"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => {
                setPasswordEdited(true);
                setForm((f) => ({ ...f, password: e.target.value }));
              }}
            />
            <p className="text-small text-muted">
              Вход в CRM — по этому номеру и паролю (роль «Учитель»). Пароль по умолчанию — сам номер, можно
              поменять здесь.
            </p>
          </>
        )}
        {isEdit && Boolean(teacher?.staffUid) && (
          <p className="text-small text-muted">Номер телефона (логин) сменить нельзя — удали учителя и заведи заново.</p>
        )}
      </form>
    </Modal>
  );
}
