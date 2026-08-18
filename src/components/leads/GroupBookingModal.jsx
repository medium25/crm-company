import { useEffect, useMemo, useState } from 'react';
import { collection, doc, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { NON_TERMINAL_STAGES } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Select } from '../ui/Select.jsx';

const MAX_RESERVATIONS_PER_GROUP = 2;

// Тот же набор, что SCHEDULE_TYPE_OPTIONS в GroupFormModal.jsx — тип
// расписания группы (чёт/нечёт/по дням недели), фильтр перед временем.
const SCHEDULE_TYPE_OPTIONS = [
  { value: 'even', label: 'Чётные дни' },
  { value: 'odd', label: 'Нечётные дни' },
  { value: 'weekdays', label: 'По дням недели' },
];

/**
 * Бронь места в группе для лида — курс + время начала. Времени начала нет
 * фиксированным списком (в отличие от trialTimeSlots у пробных) — группы
 * сами задают его свободным полем (GroupFormModal), поэтому список времён
 * тут собирается из фактических групп выбранного курса.
 *
 * Бронь — это просто reservedGroupId на самом лиде, не отдельная сущность
 * со сроком: пока лид активен (funnelStage нетерминальный), место за ним
 * числится «забронировано»; ушёл в отказ/оплачено — освободилось само,
 * никакого отдельного снятия по таймеру не нужно (см. reservedCountFor).
 * До 2 такиx броней разом на группу суммарно по всем операторам.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {Array<Object>} props.allLeads полный список лидов доски — для подсчёта броней без лишнего запроса
 * @param {() => void} props.onClose
 */
export function GroupBookingModal({ lead, allLeads, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [courseId, setCourseId] = useState('');
  const [scheduleType, setScheduleType] = useState('');
  const [time, setTime] = useState('');
  const [savingGroupId, setSavingGroupId] = useState(null);

  useEffect(() => {
    setCourseId('');
    setScheduleType('');
    setTime('');
  }, [lead?.id]);

  const coursesQuery = useMemo(() => (db ? query(collection(db, 'courses'), where('isArchived', '==', false)) : null), []);
  const { data: coursesRaw } = useCollection(coursesQuery);
  const courses = useMemo(() => [...coursesRaw].sort((a, b) => a.name.localeCompare(b.name)), [coursesRaw]);

  const groupsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId],
  );
  const { data: allGroups } = useCollection(groupsQuery);

  const courseGroups = useMemo(() => allGroups.filter((g) => g.courseId === courseId), [allGroups, courseId]);
  const typedGroups = useMemo(
    () => courseGroups.filter((g) => g.schedule?.type === scheduleType),
    [courseGroups, scheduleType],
  );
  const timeOptions = useMemo(() => [...new Set(typedGroups.map((g) => g.schedule?.time).filter(Boolean))].sort(), [typedGroups]);
  const matchingGroups = useMemo(() => typedGroups.filter((g) => g.schedule?.time === time), [typedGroups, time]);

  if (!lead) return null;

  // othersReserved решает, свободно ли место (себя же не блокируем);
  // totalReserved — то, что видит оператор в бейдже, включая свою бронь.
  const reservedCountsFor = (groupId) => {
    const holders = allLeads.filter((l) => l.reservedGroupId === groupId && NON_TERMINAL_STAGES.includes(l.funnelStage ?? 'new'));
    return {
      total: holders.length,
      others: holders.filter((l) => l.id !== lead.id).length,
    };
  };

  const book = async (group) => {
    setSavingGroupId(group.id);
    try {
      await updateDoc(doc(db, 'students', lead.id), {
        reservedGroupId: group.id,
        reservedGroupLabel: `${group.code} · ${group.courseName} · ${group.schedule?.time ?? ''}`,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast(`${lead.fullName}: место в группе ${group.code} забронировано.`);
      onClose();
    } catch {
      showToast('Не удалось забронировать место.', { type: 'error' });
    } finally {
      setSavingGroupId(null);
    }
  };

  const release = async () => {
    setSavingGroupId('release');
    try {
      await updateDoc(doc(db, 'students', lead.id), {
        reservedGroupId: null,
        reservedGroupLabel: null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast(`${lead.fullName}: бронь снята.`);
      onClose();
    } catch {
      showToast('Не удалось снять бронь.', { type: 'error' });
    } finally {
      setSavingGroupId(null);
    }
  };

  return (
    <Modal open={Boolean(lead)} onClose={onClose} title={`Бронь места: ${lead.fullName}`}>
      <div className="flex flex-col gap-4">
        {lead.reservedGroupId && (
          <div className="flex items-center justify-between gap-2 rounded-field bg-orange-soft/40 p-3">
            <span className="text-[13px] text-text">Текущая бронь: {lead.reservedGroupLabel || lead.reservedGroupId}</span>
            <button
              type="button"
              onClick={release}
              disabled={savingGroupId === 'release'}
              className="shrink-0 rounded-field border border-danger px-2.5 py-1.5 text-[12px] font-bold text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Снять бронь
            </button>
          </div>
        )}

        <Select
          label="Курс"
          options={[{ value: '', label: 'Не выбран' }, ...courses.map((c) => ({ value: c.id, label: c.name }))]}
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setScheduleType('');
            setTime('');
          }}
        />

        {courseId && (
          <Select
            label="Дни"
            options={[{ value: '', label: 'Не выбрано' }, ...SCHEDULE_TYPE_OPTIONS]}
            value={scheduleType}
            onChange={(e) => {
              setScheduleType(e.target.value);
              setTime('');
            }}
          />
        )}

        {courseId && scheduleType && (
          <Select
            label="Время начала"
            options={[{ value: '', label: 'Не выбрано' }, ...timeOptions.map((t) => ({ value: t, label: t }))]}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        )}

        {time && (
          <div className="flex flex-col gap-2">
            {matchingGroups.length === 0 && <p className="text-[13px] text-muted">Групп с таким временем нет.</p>}
            {matchingGroups.map((g) => {
              const { total, others } = reservedCountsFor(g.id);
              const isThisGroup = lead.reservedGroupId === g.id;
              const full = others >= MAX_RESERVATIONS_PER_GROUP;
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 rounded-field border border-border-strong p-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-text">{g.code}</p>
                    <p className="text-[12px] text-muted">
                      {g.studentsCount ?? 0} учеников · забронировано {total}/{MAX_RESERVATIONS_PER_GROUP}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={full || isThisGroup || savingGroupId === g.id}
                    onClick={() => book(g)}
                    className={`shrink-0 rounded-field px-3 py-1.5 text-[12px] font-bold disabled:cursor-not-allowed ${
                      isThisGroup
                        ? 'border border-navy text-navy opacity-60'
                        : full
                          ? 'border border-border-strong text-muted opacity-60'
                          : 'bg-navy text-white hover:bg-navy-hover'
                    }`}
                  >
                    {isThisGroup ? 'Забронировано' : full ? 'Занято' : 'Забронировать'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
