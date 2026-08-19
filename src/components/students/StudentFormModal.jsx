import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, updateDoc, doc, query, where, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { getActiveLeadOperators, getOperatorSchedules, assignOperatorForLead } from '../../lib/leadFunnel.js';
import { recomputeStudentAggregates } from '../../lib/students.js';

const SOURCE_OPTIONS = [
  { value: '', label: 'Не указан' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'meta_target', label: 'Таргет в Meta' },
  { value: 'friends', label: 'Друзья' },
  { value: 'outdoor', label: 'Наружная реклама' },
  { value: 'other', label: 'Другое' },
];

const EMPTY_FORM = { fullName: '', phone: '', phone2: '', source: '', assignedOperator: '' };

/**
 * Создание/редактирование студента (он же лид — одна коллекция). `student` =
 * null (закрыто), {} (создание) или сущность (редактирование).
 * @param {Object} props
 * @param {Object|null} props.student
 * @param {() => void} props.onClose
 * @param {(id: string) => void} [props.onCreated] коллбэк с ID нового студента
 * @param {'lead'|'trial'|'trial_completed'} [props.createMode] что писать при
 *   создании (не влияет на редактирование): 'lead' (по умолчанию) — обычный
 *   лид в воронке «Заявки» (funnelStage:'new'); 'trial' — сразу
 *   status:'trial' в обход воронки («Добавить ученика» на «Студенты»);
 *   'trial_completed' — сразу карточкой в «Пробный проведён» («+» под этой
 *   колонкой на «Пробные», для тех, кто пришёл на пробный без записи).
 */
export function StudentFormModal({ student, onClose, onCreated, createMode = 'lead' }) {
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
        assignedOperator: '',
        groupId: '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [student]);

  const isEdit = Boolean(student?.id);
  // Выбор/смена группы прямо из формы — только для пробных (не лидов в
  // воронке «Заявки» и не платящих активных, у тех — свои «Добавить в
  // группу»/«Перевести» с биллингом, тут его нет: пробный ещё не платит).
  const isTrialStatus = isEdit && student?.status === 'trial';
  const groupsQuery = useMemo(
    () => (db && activeBranchId && isTrialStatus ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId, isTrialStatus],
  );
  const { data: groups } = useCollection(groupsQuery);
  const enrollmentsQuery = useMemo(
    () => (db && isTrialStatus && student?.id ? query(collection(db, 'enrollments'), where('studentId', '==', student.id), where('isArchived', '==', false)) : null),
    [isTrialStatus, student?.id],
  );
  const { data: studentEnrollments } = useCollection(enrollmentsQuery);
  const currentEnrollment = studentEnrollments[0] ?? null;

  useEffect(() => {
    if (!isTrialStatus) return;
    setForm((f) => ({ ...f, groupId: currentEnrollment?.groupId ?? '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEnrollment?.groupId, isTrialStatus, student?.id]);
  // При ручном добавлении пробного (в обход авто-распределения «Заявки»)
  // ответственного выбирает сам — ICON (пустое значение) для пришедших
  // без ответственного лица.
  const needsOperatorPick = !isEdit && createMode !== 'lead';
  const staffQuery = useMemo(
    () => (db && activeBranchId && needsOperatorPick ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId, needsOperatorPick],
  );
  const { data: staffList } = useCollection(staffQuery);
  const operatorOptions = [
    { value: '', label: 'ICON (без ответственного)' },
    ...[...staffList].sort((a, b) => a.fullName.localeCompare(b.fullName)).map((s) => ({ value: s.id, label: s.fullName })),
  ];
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

        if (isTrialStatus && form.groupId && form.groupId !== (currentEnrollment?.groupId ?? '')) {
          const group = groups.find((g) => g.id === form.groupId);
          if (group) {
            const now = serverTimestamp();
            if (currentEnrollment) {
              // Пробный ещё не платит — просто переносим запись в другую
              // группу, без дробления списаний (в отличие от TransferGroupModal
              // для уже активных платящих студентов).
              await updateDoc(doc(db, 'enrollments', currentEnrollment.id), {
                groupId: group.id,
                groupCode: group.code,
                courseName: group.courseName,
                teacherId: group.teacherId,
                teacherName: group.teacherName,
                price: group.price,
                updatedAt: now,
                updatedBy: user.uid,
              });
              if (currentEnrollment.groupId !== group.id) {
                await updateDoc(doc(db, 'groups', currentEnrollment.groupId), { studentsCount: increment(-1) });
                await updateDoc(doc(db, 'groups', group.id), { studentsCount: increment(1) });
              }
            } else {
              await addDoc(collection(db, 'enrollments'), {
                branchId: activeBranchId,
                studentId: student.id,
                studentName: payload.fullName,
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
            }
            await recomputeStudentAggregates(db, student.id);
          }
        }

        showToast('Студент обновлён.');
        onClose();
      } else if (createMode === 'trial') {
        // Пробный студент напрямую, минуя воронку «Заявки» — без
        // funnelStage/assignedOperator/stageHistory, иначе он попадёт
        // карточкой в «Новый лид», хотя это не лид.
        const created = await addDoc(collection(db, 'students'), {
          ...payload,
          branchId: activeBranchId,
          publicId: Math.floor(1000000 + Math.random() * 9000000),
          birthDate: null,
          gender: null,
          photoUrl: null,
          status: 'trial',
          statusReason: null,
          assignedOperator: form.assignedOperator || null,
          balance: 0,
          balanceUpdatedAt: serverTimestamp(),
          note: '',
          isFlagged: false,
          activeGroupsCount: 0,
          firstPaymentAt: null,
          lastPaymentAt: null,
          trialAt: serverTimestamp(),
          leftAt: null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          isArchived: false,
        });
        showToast('Студент добавлен.');
        onCreated?.(created.id);
        onClose();
      } else if (createMode === 'trial_completed') {
        // Пришёл на пробный без записи оператором — сразу карточкой в
        // «Пробный проведён» (funnelStage), attended:true как и у обычного
        // пути через «Создать студента» (AddToGroupModal), для отчётов.
        const created = await addDoc(collection(db, 'students'), {
          ...payload,
          branchId: activeBranchId,
          publicId: Math.floor(1000000 + Math.random() * 9000000),
          birthDate: null,
          gender: null,
          photoUrl: null,
          status: 'trial',
          statusReason: null,
          assignedOperator: form.assignedOperator || null,
          funnelStage: 'trial_completed',
          stageHistory: [{ stage: 'trial_completed', enteredAt: new Date() }],
          attended: true,
          balance: 0,
          balanceUpdatedAt: serverTimestamp(),
          note: '',
          isFlagged: false,
          activeGroupsCount: 0,
          firstPaymentAt: null,
          lastPaymentAt: null,
          trialAt: serverTimestamp(),
          leftAt: null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          isArchived: false,
        });
        showToast('Студент добавлен.');
        onCreated?.(created.id);
        onClose();
      } else {
        const [operatorIds, operatorSchedules] = await Promise.all([
          getActiveLeadOperators(db, activeBranchId),
          getOperatorSchedules(db, activeBranchId),
        ]);
        const operators = operatorIds.map((id) => ({ id, workSchedule: operatorSchedules[id] }));
        const assignedOperator = await assignOperatorForLead(db, activeBranchId, operators, new Date());
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
      title={student?.id ? 'Редактировать студента' : createMode === 'lead' ? 'Добавить лида' : 'Добавить ученика'}
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
        {needsOperatorPick && (
          <Select
            label="Ответственный"
            options={operatorOptions}
            value={form.assignedOperator}
            onChange={(e) => setForm((f) => ({ ...f, assignedOperator: e.target.value }))}
          />
        )}
        {isTrialStatus && (
          <Select
            label="Группа"
            options={[{ value: '', label: 'Не выбрана' }, ...groups.map((g) => ({ value: g.id, label: `${g.code} · ${g.courseName}` }))]}
            value={form.groupId}
            onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
          />
        )}
      </form>
    </Modal>
  );
}
