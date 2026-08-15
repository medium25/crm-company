import { useEffect, useState } from 'react';
import { collection, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { getActiveLeadOperators, assignLeastLoadedOperator } from '../../lib/leadFunnel.js';

const SOURCE_OPTIONS = [
  { value: '', label: 'Не указан' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'friends', label: 'Друзья' },
  { value: 'outdoor', label: 'Наружная реклама' },
  { value: 'other', label: 'Другое' },
];

const EMPTY_FORM = { fullName: '', phone: '', phone2: '', source: '' };

/**
 * Создание/редактирование студента (он же лид — одна коллекция). `student` =
 * null (закрыто), {} (создание) или сущность (редактирование).
 * @param {Object} props
 * @param {Object|null} props.student
 * @param {() => void} props.onClose
 * @param {(id: string) => void} [props.onCreated] коллбэк с ID нового студента
 */
export function StudentFormModal({ student, onClose, onCreated }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!student) return;
    if (student.id) {
      setForm({
        fullName: student.fullName ?? '',
        phone: student.phone ?? '',
        phone2: student.phone2 ?? '',
        source: student.source ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [student]);

  const isEdit = Boolean(student?.id);
  // При создании — обязательно 2 номера, без второго лид не заводится (это
  // не про редактирование старых карточек, у которых его могло не быть).
  const missingSecondPhone = !isEdit && !form.phone2.trim();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (missingSecondPhone) return;
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        phone: form.phone.replace(/\D/g, ''),
        phone2: form.phone2 ? form.phone2.replace(/\D/g, '') : null,
        source: form.source || null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };
      if (student?.id) {
        await updateDoc(doc(db, 'students', student.id), payload);
        showToast('Студент обновлён.');
        onClose();
      } else {
        const operatorIds = await getActiveLeadOperators(db, activeBranchId);
        const assignedOperator = await assignLeastLoadedOperator(db, activeBranchId, operatorIds);
        const created = await addDoc(collection(db, 'students'), {
          ...payload,
          branchId: activeBranchId,
          publicId: Math.floor(1000000 + Math.random() * 9000000),
          birthDate: null,
          gender: null,
          photoUrl: null,
          status: 'lead',
          statusReason: null,
          funnelStage: 'new',
          assignedOperator,
          stageHistory: [{ stage: 'new', enteredAt: new Date() }],
          balance: 0,
          balanceUpdatedAt: serverTimestamp(),
          note: '',
          isFlagged: false,
          activeGroupsCount: 0,
          firstPaymentAt: null,
          lastPaymentAt: null,
          trialAt: null,
          leftAt: null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          isArchived: false,
        });
        showToast('Лид добавлен.');
        onCreated?.(created.id);
        onClose();
      }
    } catch {
      showToast('Не удалось сохранить студента.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      title={student?.id ? 'Редактировать студента' : 'Добавить лида'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={missingSecondPhone || !form.fullName.trim() || !form.phone.trim()}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Имя"
          required
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
        <Input
          label="Второй телефон"
          placeholder="998901234567"
          required={!isEdit}
          value={form.phone2}
          onChange={(e) => setForm((f) => ({ ...f, phone2: e.target.value }))}
        />
        {missingSecondPhone && (
          <p className="-mt-2 text-[13px] text-danger">Без второго номера телефона добавить ученика нельзя.</p>
        )}
        <Select
          label="Источник"
          options={SOURCE_OPTIONS}
          value={form.source}
          onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
        />
      </form>
    </Modal>
  );
}
