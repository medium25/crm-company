import { useEffect, useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { cascadeTeacherName } from '../../lib/teachers.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

const EMPTY_FORM = { displayName: '', fullName: '', phone: '' };

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!teacher) return;
    setForm({
      displayName: teacher.displayName ?? '',
      fullName: teacher.fullName ?? '',
      phone: teacher.phone ?? '',
    });
  }, [teacher]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        displayName: form.displayName.trim(),
        fullName: form.fullName.trim(),
        phone: form.phone.replace(/\D/g, ''),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };
      if (teacher?.id) {
        await updateDoc(doc(db, 'teachers', teacher.id), payload);
        if (payload.displayName !== teacher.displayName) {
          await cascadeTeacherName(db, teacher.id, payload.displayName);
        }
        showToast('Учитель обновлён.');
      } else {
        await addDoc(collection(db, 'teachers'), {
          ...payload,
          branchId: activeBranchId,
          branchIds: [activeBranchId],
          staffUid: null,
          groupsCount: 0,
          isActive: true,
          isArchived: false,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
        showToast('Учитель добавлен.');
      }
      onClose();
    } catch {
      showToast('Не удалось сохранить учителя.', { type: 'error' });
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
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
      </form>
    </Modal>
  );
}
