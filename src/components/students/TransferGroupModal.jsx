import { useEffect, useMemo, useState } from 'react';
import { collection, doc, writeBatch, increment, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { recomputeStudentAggregates } from '../../lib/students.js';
import { chargeAmountForLessons } from '../../lib/billing.js';
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
 * статусом. `activatedAt` переносится как есть.
 *
 * Если месяц уже списан в старой группе — списание дробится между старой и
 * новой записью по вручную введённому числу «уроков уже прошло». Оплаты
 * этого месяца перевод не трогает — деньги остаются на той транзакции, на
 * которую были изначально записаны, см.
 * `docs/superpowers/specs/2026-08-15-mid-month-group-transfer-split-design.md`.
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
  const [alreadyHad, setAlreadyHad] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enrollment) {
      setGroupId('');
      setPrice('');
      setTransferredAt(format(new Date(), 'yyyy-MM-dd'));
      setAlreadyHad('');
    }
  }, [enrollment]);

  const targetGroup = groups.find((g) => g.id === groupId);
  const month = transferredAt ? format(new Date(`${transferredAt}T00:00:00`), 'yyyy-MM') : '';

  const oldGroupRef = useMemo(() => (db && enrollment ? doc(db, 'groups', enrollment.groupId) : null), [enrollment]);
  const { data: oldGroup } = useDoc(oldGroupRef);

  const oldChargeRef = useMemo(
    () => (db && enrollment && month ? doc(db, 'transactions', `charge_${enrollment.id}_${month}`) : null),
    [enrollment, month],
  );
  const { data: oldCharge } = useDoc(oldChargeRef);

  const totalOld = oldCharge?.lessonsCount ?? oldGroup?.lessonsPerMonth ?? 0;
  const alreadyHadNum = Math.min(Math.max(Number(alreadyHad) || 0, 0), totalOld);
  const remaining = Math.max(totalOld - alreadyHadNum, 0);

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
        transferredFromGroupCode: enrollment.groupCode,
        transferredFromSchedule: oldGroup?.schedule ?? null,
        transferredLessonsCount: alreadyHadNum,
        transferredAt: transferredAtTs,
        transferNoteDismissed: false,
        createdAt: now,
        createdBy: user.uid,
        updatedAt: now,
        updatedBy: user.uid,
      });
      batch.update(doc(db, 'groups', targetGroup.id), { studentsCount: increment(1) });

      // --- Дробление списания этого месяца между старой и новой группой ---
      if (oldGroup && totalOld > 0) {
        const oldChargeTxRef = doc(db, 'transactions', `charge_${enrollment.id}_${month}`);
        const oldChargeAmount = chargeAmountForLessons(enrollment, oldGroup, alreadyHadNum);

        if (oldCharge) {
          const delta = oldChargeAmount - oldCharge.amount;
          if (delta !== 0) {
            batch.update(oldChargeTxRef, {
              amount: oldChargeAmount,
              lessonsCount: alreadyHadNum,
              comment: `${alreadyHadNum} ур. (перевод в ${targetGroup.code})`,
              updatedAt: now,
              updatedBy: user.uid,
            });
            batch.update(doc(db, 'students', enrollment.studentId), { balance: increment(delta), balanceUpdatedAt: now });
            batch.set(
              doc(db, 'monthlyBalances', `${enrollment.studentId}_${month}`),
              { charges: increment(delta), balance: increment(delta), updatedAt: now },
              { merge: true },
            );
          }
        } else if (alreadyHadNum > 0) {
          const monthStartTs = Timestamp.fromDate(startOfMonth(new Date(`${transferredAt}T00:00:00`)));
          batch.set(oldChargeTxRef, {
            studentId: enrollment.studentId,
            studentName: enrollment.studentName,
            branchId: oldGroup.branchId,
            enrollmentId: enrollment.id,
            groupId: oldGroup.id,
            groupCode: oldGroup.code,
            teacherId: oldGroup.teacherId,
            teacherName: oldGroup.teacherName,
            type: 'charge',
            amount: oldChargeAmount,
            affectsBalance: true,
            method: null,
            date: monthStartTs,
            month,
            comment: `${alreadyHadNum} ур. (перевод в ${targetGroup.code})`,
            periodFrom: monthStartTs,
            periodTo: transferredAtTs,
            lessonsCount: alreadyHadNum,
            createdBy: user.uid,
            createdByName: staff?.fullName ?? '',
            createdAt: now,
          });
          batch.update(doc(db, 'students', enrollment.studentId), { balance: increment(oldChargeAmount), balanceUpdatedAt: now });
          batch.set(
            doc(db, 'monthlyBalances', `${enrollment.studentId}_${month}`),
            { charges: increment(oldChargeAmount), balance: increment(oldChargeAmount), updatedAt: now },
            { merge: true },
          );
        }

        if (remaining > 0) {
          const monthEndTs = Timestamp.fromDate(endOfMonth(new Date(`${transferredAt}T00:00:00`)));
          const newChargeAmount = chargeAmountForLessons({ price: priceNum }, targetGroup, remaining);
          batch.set(doc(db, 'transactions', `charge_${newEnrollmentRef.id}_${month}`), {
            studentId: enrollment.studentId,
            studentName: enrollment.studentName,
            branchId: targetGroup.branchId,
            enrollmentId: newEnrollmentRef.id,
            groupId: targetGroup.id,
            groupCode: targetGroup.code,
            teacherId: targetGroup.teacherId,
            teacherName: targetGroup.teacherName,
            type: 'charge',
            amount: newChargeAmount,
            affectsBalance: true,
            method: null,
            date: transferredAtTs,
            month,
            comment: `${remaining} ур. (перевод из ${oldGroup.code})`,
            periodFrom: transferredAtTs,
            periodTo: monthEndTs,
            lessonsCount: remaining,
            createdBy: user.uid,
            createdByName: staff?.fullName ?? '',
            createdAt: now,
          });
          batch.update(doc(db, 'students', enrollment.studentId), { balance: increment(newChargeAmount), balanceUpdatedAt: now });
          batch.set(
            doc(db, 'monthlyBalances', `${enrollment.studentId}_${month}`),
            { charges: increment(newChargeAmount), balance: increment(newChargeAmount), updatedAt: now },
            { merge: true },
          );
          batch.update(newEnrollmentRef, { lastChargedMonth: month });
        }
      }

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

        {totalOld > 0 && (
          <>
            <Input
              label={`Уроков уже прошло в ${enrollment?.groupCode ?? ''} в этом месяце`}
              type="number"
              min="0"
              max={totalOld}
              value={alreadyHad}
              onChange={(e) => setAlreadyHad(e.target.value)}
            />
            <p className="text-[13px] text-muted">
              Спишется {alreadyHadNum} ур. со старой группы, {remaining} ур. с новой (из {totalOld}).
            </p>
          </>
        )}
      </form>
    </Modal>
  );
}
