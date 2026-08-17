import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage, trialConfirmDueAt } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

const DEFAULT_TIME_SLOTS = ['09:00', '10:30', '14:00', '15:30', '17:00', '18:30', '20:00'];

/**
 * Назначение или перенос даты пробного урока (2026-08-13-leads-funnel-
 * redesign.md §5). `mode: 'schedule'` — первое назначение, переводит лида
 * в `trial_scheduled` через `advanceStage`. `mode: 'reschedule'` — перенос:
 * та же форма, но стадия не меняется (лид остаётся в `trial_scheduled`),
 * только новая дата и `rescheduleCount += 1`.
 *
 * Учителя тут не выбираем — только курс (Рус/Англ) и время из
 * настраиваемого списка (Настройки → Справочники → «Время пробных
 * уроков»); день недели карточка сама выводит из даты.
 * @param {Object} props
 * @param {{lead: Object, mode: 'schedule'|'reschedule'}|null} props.target
 * @param {string[]} [props.timeSlots] доступные времена, из branchSettings.trialTimeSlots
 * @param {() => void} props.onClose
 */
export function TrialFormModal({ target, timeSlots = DEFAULT_TIME_SLOTS, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(timeSlots[0] ?? DEFAULT_TIME_SLOTS[0]);
  const [courseId, setCourseId] = useState('');
  const [saving, setSaving] = useState(false);

  const coursesQuery = useMemo(() => (db ? query(collection(db, 'courses'), where('isArchived', '==', false)) : null), []);
  const { data: coursesRaw } = useCollection(coursesQuery);
  const courses = useMemo(() => [...coursesRaw].sort((a, b) => a.name.localeCompare(b.name)), [coursesRaw]);

  useEffect(() => {
    if (!target) return;
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime(timeSlots[0] ?? DEFAULT_TIME_SLOTS[0]);
    setCourseId(target.lead.trialCourseId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;
  const { lead, mode } = target;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trialDateJs = new Date(`${date}T${time}:00`);
      const trialDate = Timestamp.fromDate(trialDateJs);
      const course = courses.find((c) => c.id === courseId);
      // Перенос тоже пересчитывает confirmDueAt и обнуляет попытки — старые
      // попытки дозвона относились к прежней дате пробного (спец «Перенос
      // пробного сбрасывает цикл подтверждения»).
      const confirmDueAt = Timestamp.fromDate(trialConfirmDueAt(trialDateJs));
      const trialFields = {
        trialDate,
        trialCourseId: courseId || null,
        trialCourseName: course?.name ?? null,
        trialConfirmDueAt: confirmDueAt,
        trialConfirmAttempts: [],
        // Напоминание на новую дату — старая галочка относилась к прежней.
        callReminderDone: false,
      };
      if (mode === 'schedule') {
        await advanceStage(db, lead, 'trial_scheduled', { status: 'trial', trialAt: serverTimestamp(), ...trialFields }, user);
        showToast(`${lead.fullName}: пробный назначен.`);
      } else {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'students', lead.id), {
          ...trialFields,
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
        <Select
          label="Курс"
          required
          options={[{ value: '', label: 'Не выбран' }, ...courses.map((c) => ({ value: c.id, label: c.name }))]}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        />
        <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Select
          label="Время"
          required
          options={timeSlots.map((t) => ({ value: t, label: t }))}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </form>
    </Modal>
  );
}
