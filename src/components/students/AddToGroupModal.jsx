import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, doc, updateDoc, increment, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { chargePartialMonth } from '../../lib/billing.js';
import { logActivity } from '../../lib/activityLog.js';
import { NON_TERMINAL_STAGES } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

const STATUS_OPTIONS = [
  { value: 'trial', label: 'Пробный' },
  { value: 'active', label: 'Активный' },
];

/**
 * Добавление студента в существующую группу — создаёт enrollment.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Object} props.student
 * @param {() => void} props.onClose
 */
export function AddToGroupModal({ open, student, onClose }) {
  const { user, staff } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const groupsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: groups } = useCollection(groupsQuery);

  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState('trial');
  const [price, setPrice] = useState('');
  const [activatedAt, setActivatedAt] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setGroupId('');
      setStatus('trial');
      setPrice('');
      setActivatedAt(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  const group = groups.find((g) => g.id === groupId);
  // Активного без фамилии не создаём — тот же порог, что и в
  // ActivateEnrollmentModal (trial → active).
  const missingLastName = status === 'active' && !((student?.fullName ?? '').trim().split(/\s+/).filter(Boolean).length >= 2);

  const handleGroupChange = (id) => {
    setGroupId(id);
    const g = groups.find((gr) => gr.id === id);
    if (g) setPrice(String(g.price));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!group || missingLastName) return;
    setSaving(true);
    try {
      const priceNum = Number(price);
      const discountPercent = group.price > 0 ? Math.round((1 - priceNum / group.price) * 100) : 0;
      const now = serverTimestamp();
      const activatedAtTs = status === 'active' ? Timestamp.fromDate(new Date(`${activatedAt}T00:00:00`)) : null;

      const enrollmentRef = await addDoc(collection(db, 'enrollments'), {
        branchId: activeBranchId,
        studentId: student.id,
        studentName: student.fullName,
        groupId: group.id,
        groupCode: group.code,
        courseName: group.courseName,
        teacherId: group.teacherId,
        teacherName: group.teacherName,
        status,
        statusLabel: status === 'active' ? 'Активен (Оплачивает обучение)' : 'Пробный урок',
        price: priceNum,
        discountPercent,
        discountReason: '',
        addedAt: now,
        activatedAt: activatedAtTs,
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
      await recomputeStudentAggregates(db, student.id);

      // Лид, добавленный в группу напрямую (минуя «Пришёл» → оплату на
      // доске «Заявки»), иначе навсегда зависает карточкой в своей стадии
      // воронки — funnelStage тут никогда бы не сдвинулся сам. Закрываем
      // воронку сразу же, раз студент фактически уже не лид — но «Оплачено»
      // ставим, только если оплата и правда была (firstPaymentAt), иначе
      // это враньё на доске. Без оплаты — «Дожим»: студент уже учится,
      // но платёж всё ещё нужно выбить.
      if (NON_TERMINAL_STAGES.includes(student.funnelStage)) {
        const hasPaid = Boolean(student.firstPaymentAt);
        const nextStage = hasPaid ? 'won' : 'closing';
        await updateDoc(doc(db, 'students', student.id), {
          funnelStage: nextStage,
          stageHistory: [...(student.stageHistory ?? []), { stage: nextStage, enteredAt: new Date() }],
          ...(hasPaid ? { paidAt: student.paidAt ?? student.firstPaymentAt } : {}),
          updatedAt: now,
          updatedBy: user.uid,
        });
      }

      await logActivity(
        db,
        { entityType: 'group', entityId: group.id, action: 'enrollment_added', field: 'studentsCount', after: student.fullName },
        { uid: user.uid, fullName: staff?.fullName ?? '' },
      );

      if (status === 'active') {
        await chargePartialMonth(
          db,
          { student, enrollment: { id: enrollmentRef.id, price: priceNum, activatedAt: activatedAtTs }, group },
          { uid: user.uid, fullName: staff?.fullName ?? '' },
        );
      }

      showToast('Студент добавлен в группу.');
      onClose();
    } catch {
      showToast('Не удалось добавить в группу.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Добавить в группу"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!groupId || missingLastName}>
            Добавить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Группа"
          required
          options={[{ value: '', label: 'Выбрать' }, ...groups.map((g) => ({ value: g.id, label: `${g.code} · ${g.courseName}` }))]}
          value={groupId}
          onChange={(e) => handleGroupChange(e.target.value)}
        />
        <Select label="Статус" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
        {missingLastName && (
          <p className="rounded-field bg-danger/5 p-3 text-[13px] text-danger">
            У студента не указана фамилия — активный статус без неё создать нельзя. Допишите фамилию в карточке
            студента.
          </p>
        )}
        <Input
          label="Стоимость для студента"
          type="number"
          min="0"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        {status === 'active' && (
          <DatePicker label="Дата активации" required value={activatedAt} onChange={(e) => setActivatedAt(e.target.value)} />
        )}
      </form>
    </Modal>
  );
}
