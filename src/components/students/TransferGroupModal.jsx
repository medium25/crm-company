import { useEffect, useMemo, useState } from 'react';
import { collection, doc, writeBatch, increment, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { logActivity } from '../../lib/activityLog.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Перевод студента из текущей группы в другую — закрывает старый enrollment
 * (`status: 'left'`, `returnIntent: 'transfer'`, чтобы не попадал в списки
 * «Хочет вернуться»/«Не хочет возвращаться» на «Покинувших» и не путался с
 * настоящим уходом) и сразу создаёт новый в целевой группе с тем же
 * статусом. `activatedAt` и `lastChargedMonth` переносятся как есть — оплата
 * за текущий месяц уже прошла в старой группе, повторное списание при
 * переводе не нужно.
 * @param {Object} props
 * @param {Object|null} props.enrollment запись, которую переводим, или null (закрыто)
 * @param {{id: string, fullName: string}} props.student
 * @param {() => void} props.onClose
 */
export function TransferGroupModal({ enrollment, student, onClose }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();

  const groupsQuery = useMemo(
    () =>
      db && enrollment
        ? query(collection(db, 'groups'), where('branchId', '==', enrollment.branchId), where('isArchived', '==', false))
        : null,
    [enrollment],
  );
  const { data: allGroups } = useCollection(groupsQuery);
  const groups = useMemo(() => allGroups.filter((g) => g.id !== enrollment?.groupId), [allGroups, enrollment]);

  const [groupId, setGroupId] = useState('');
  const [price, setPrice] = useState('');
  const [transferredAt, setTransferredAt] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enrollment) {
      setGroupId('');
      setPrice('');
      setTransferredAt(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [enrollment]);

  const targetGroup = groups.find((g) => g.id === groupId);

  const handleGroupChange = (id) => {
    setGroupId(id);
    const g = groups.find((gr) => gr.id === id);
    if (g) setPrice(String(g.price));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!enrollment || !targetGroup || !transferredAt) return;
    setSaving(true);
    try {
      const priceNum = Number(price);
      const discountPercent = targetGroup.price > 0 ? Math.round((1 - priceNum / targetGroup.price) * 100) : 0;
      const now = serverTimestamp();
      const transferredAtTs = Timestamp.fromDate(new Date(`${transferredAt}T00:00:00`));

      const batch = writeBatch(db);

      batch.update(doc(db, 'enrollments', enrollment.id), {
        status: 'left',
        leftAt: transferredAtTs,
        leftReason: `Перевод в группу ${targetGroup.code}`,
        returnIntent: 'transfer',
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(db, 'groups', enrollment.groupId), { studentsCount: increment(-1) });

      const newEnrollmentRef = doc(collection(db, 'enrollments'));
      batch.set(newEnrollmentRef, {
        branchId: targetGroup.branchId,
        studentId: enrollment.studentId,
        studentName: enrollment.studentName,
        groupId: targetGroup.id,
        groupCode: targetGroup.code,
        courseName: targetGroup.courseName,
        teacherId: targetGroup.teacherId,
        teacherName: targetGroup.teacherName,
        status: enrollment.status,
        statusLabel: enrollment.statusLabel,
        price: priceNum,
        discountPercent,
        discountReason: '',
        addedAt: now,
        activatedAt: enrollment.activatedAt ?? null,
        pausedFrom: enrollment.pausedFrom ?? null,
        pausedTo: enrollment.pausedTo ?? null,
        leftAt: null,
        leftReason: null,
        lastChargedMonth: enrollment.lastChargedMonth ?? null,
        isArchived: false,
        transferredFromGroupId: enrollment.groupId,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(db, 'groups', targetGroup.id), { studentsCount: increment(1) });

      await batch.commit();
      await recomputeStudentAggregates(db, enrollment.studentId);

      const actor = { uid: user.uid, fullName: staff?.fullName ?? '' };
      await logActivity(
        db,
        { entityType: 'group', entityId: enrollment.groupId, action: 'enrollment_transferred_out', field: 'studentsCount', before: enrollment.studentName, after: targetGroup.code },
        actor,
      );
      await logActivity(
        db,
        { entityType: 'group', entityId: targetGroup.id, action: 'enrollment_transferred_in', field: 'studentsCount', before: enrollment.groupCode, after: enrollment.studentName },
        actor,
      );

      showToast('Студент переведён в другую группу.');
      onClose();
    } catch {
      showToast('Не удалось перевести студента.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(enrollment)}
      onClose={onClose}
      title="Перевести в другую группу"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving} disabled={!groupId || !transferredAt}>
            Перевести
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[15px] text-text">
          Студент <b>{enrollment?.studentName}</b> покинет группу <b>{enrollment?.groupCode}</b> и будет добавлен в
          выбранную группу с тем же статусом (<b>{enrollment?.statusLabel}</b>).
        </p>
        <Select
          label="Новая группа"
          required
          options={[{ value: '', label: 'Выбрать' }, ...groups.map((g) => ({ value: g.id, label: `${g.code} · ${g.courseName}` }))]}
          value={groupId}
          onChange={(e) => handleGroupChange(e.target.value)}
        />
        <Input
          label="Стоимость для студента"
          type="number"
          min="0"
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <DatePicker label="Дата перевода" required value={transferredAt} onChange={(e) => setTransferredAt(e.target.value)} />
      </form>
    </Modal>
  );
}
