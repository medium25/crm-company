import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Назначение или перенос даты пробного урока (2026-08-13-leads-funnel-
 * redesign.md §5). `mode: 'schedule'` — первое назначение, переводит лида
 * в `trial_scheduled` через `advanceStage`. `mode: 'reschedule'` — «Не
 * пришёл»: та же форма, но стадия не меняется (лид остаётся в
 * `trial_scheduled`), только новая дата и `rescheduleCount += 1`.
 * @param {Object} props
 * @param {{lead: Object, mode: 'schedule'|'reschedule'}|null} props.target
 * @param {() => void} props.onClose
 */
export function TrialFormModal({ target, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState('12:00');
  const [teacherId, setTeacherId] = useState('');
  const [saving, setSaving] = useState(false);

  const teachersQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'teachers'), where('branchIds', 'array-contains', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId],
  );
  const { data: teachers } = useCollection(teachersQuery);

  useEffect(() => {
    if (!target) return;
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime('12:00');
    setTeacherId(target.lead.trialTeacherId ?? '');
  }, [target]);

  if (!target) return null;
  const { lead, mode } = target;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trialDate = Timestamp.fromDate(new Date(`${date}T${time}:00`));
      if (mode === 'schedule') {
        await advanceStage(db, lead, 'trial_scheduled', {
          status: 'trial',
          trialAt: serverTimestamp(),
          trialDate,
          trialTeacherId: teacherId || null,
        }, user);
        showToast(`${lead.fullName}: пробный назначен.`);
      } else {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'students', lead.id), {
          trialDate,
          trialTeacherId: teacherId || null,
          rescheduleCount: (lead.rescheduleCount ?? 0) + 1,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        showToast(`${lead.fullName}: пробный перенесён.`);
      }
      onClose();
    } catch {
      showToast('Не удалось сохранить дату пробного.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={mode === 'schedule' ? `Пробный: ${lead.fullName}` : `Перенос пробного: ${lead.fullName}`}
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
        <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Время" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        <Select
          label="Учитель"
          options={[{ value: '', label: 'Не выбран' }, ...teachers.map((t) => ({ value: t.id, label: t.displayName }))]}
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
        />
      </form>
    </Modal>
  );
}
