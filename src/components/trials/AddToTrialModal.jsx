import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteField, doc, increment, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { format, startOfDay } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { GroupOptions } from '../ui/GroupOptions.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { advanceStage, trialConfirmDueAt, NON_TERMINAL_STAGES } from '../../lib/leadFunnel.js';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { logActivity } from '../../lib/activityLog.js';

/** Нужно ли этому человеку двигать воронку: лид на стадии или отказавшийся (в т.ч. архивный). Бывший студент (won) — нет. */
const needsFunnelMove = (s) => NON_TERMINAL_STAGES.includes(s.funnelStage) || s.funnelStage === 'lost';

/**
 * «Добавить в пробный» — человек, найденный поиском (лид, отказавшийся, архивный, ушедший), записывается на пробный:
 * дата + группа (учитель берётся из группы). Создаётся запись enrollment со статусом «пробный», у студента ставится
 * trialDate; архивный возвращается из архива. Лид переводится в «Пробный назначен» (дата в будущем или сегодня, с
 * дедлайном звонка-подтверждения за сутки) или «Пробный проведён» (дата в прошлом). Бывший студент без воронки
 * (funnelStage 'won') воронкой не двигается.
 * @param {Object} props
 * @param {Object|null} props.student документ students; null — закрыто
 * @param {() => void} props.onClose
 */
export function AddToTrialModal({ student, onClose }) {
  const { user, staff } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [groupId, setGroupId] = useState('');
  const [saving, setSaving] = useState(false);

  const groupsQuery = useMemo(
    () =>
      db && activeBranchId && student
        ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId, student],
  );
  const { data: groups } = useCollection(groupsQuery);
  const group = groups.find((g) => g.id === groupId);

  useEffect(() => {
    if (!student) return;
    // Лид с уже назначенной датой пробного — дата подставляется, остаётся выбрать группу.
    const existing = student.trialDate?.toDate?.();
    setDate(format(existing ?? new Date(), 'yyyy-MM-dd'));
    setGroupId('');
  }, [student]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!student || !group || !date) return;
    setSaving(true);
    try {
      const time = group.schedule?.time ?? '00:00';
      const trialDateJs = new Date(`${date}T${time}:00`);
      const upcoming = startOfDay(trialDateJs) >= startOfDay(new Date());
      const now = serverTimestamp();

      await addDoc(collection(db, 'enrollments'), {
        branchId: activeBranchId,
        studentId: student.id,
        studentName: student.fullName,
        groupId: group.id,
        groupCode: group.code,
        courseName: group.courseName,
        teacherId: group.teacherId,
        teacherName: group.teacherName,
        status: 'trial',
        statusLabel: 'Пробный урок',
        price: group.price,
        discountPercent: 0,
        discountReason: '',
        addedAt: now,
        activatedAt: null,
        pausedFrom: null,
        pausedTo: null,
        leftAt: null,
        leftReason: null,
        lastChargedMonth: null,
        isArchived: false,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
      await updateDoc(doc(db, 'groups', group.id), { studentsCount: increment(1) });

      const trialFields = {
        status: 'trial',
        trialAt: now,
        trialDate: Timestamp.fromDate(trialDateJs),
        ...(student.isArchived ? { isArchived: false, archivedAt: deleteField() } : {}),
      };
      if (needsFunnelMove(student)) {
        const extra = upcoming
          ? {
              ...trialFields,
              // Дедлайны стадии — дата пробного и звонок-подтверждение за сутки (как в TrialFormModal).
              trialConfirmDueAt: Timestamp.fromDate(trialConfirmDueAt(trialDateJs)),
              trialConfirmAttempts: [],
              callReminderDone: false,
              unreachableNextCallDueAt: null,
              attended: false,
            }
          : { ...trialFields, attended: true };
        const nextStage = upcoming ? 'trial_scheduled' : 'trial_completed';
        if (student.funnelStage === nextStage) {
          // Уже на этой стадии (лид с назначенной датой): стадию и историю не дублируем, дедлайны не сбрасываем,
          // если дата не менялась.
          const sameDate = student.trialDate?.toDate?.().getTime() === trialDateJs.getTime();
          const keep = sameDate ? { trialDate: undefined, trialConfirmDueAt: undefined, trialConfirmAttempts: undefined, callReminderDone: undefined, unreachableNextCallDueAt: undefined, attended: undefined } : {};
          const fields = Object.fromEntries(Object.entries({ ...extra, ...keep, lostReason: null, lostAt: null }).filter(([, v]) => v !== undefined));
          await updateDoc(doc(db, 'students', student.id), { ...fields, updatedAt: now, updatedBy: user.uid });
        } else {
          await advanceStage(db, student, nextStage, { ...extra, lostReason: null, lostAt: null }, user);
        }
      } else {
        await updateDoc(doc(db, 'students', student.id), { ...trialFields, updatedAt: now, updatedBy: user.uid });
      }
      await recomputeStudentAggregates(db, student.id);
      await logActivity(
        db,
        { entityType: 'group', entityId: group.id, action: 'enrollment_added', field: 'studentsCount', after: student.fullName },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );

      showToast(`${student.fullName}: добавлен в пробный.`);
      onClose();
    } catch {
      showToast('Не удалось добавить в пробный.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(student)}
      onClose={onClose}
      title="Добавить в пробный"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!groupId || !date}>
            Добавить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-control text-text">
          <b>{student?.fullName}</b>
          {student?.isArchived && <span className="text-muted"> · сейчас в архиве, вернётся из архива</span>}
        </p>
        <DatePicker label="Дата пробного" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Select label="Группа" required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <GroupOptions items={groups} />
        </Select>
        {group && (
          <p className="text-small text-muted">
            Учитель: {group.teacherName} · время: {group.schedule?.time ?? '—'}
          </p>
        )}
      </form>
    </Modal>
  );
}
