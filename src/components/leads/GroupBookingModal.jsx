import { useMemo, useState, useEffect } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { computeSlotOccupancy, distributeOccupancy, SLOTS_PER_GROUP } from '../../lib/groupCapacity.js';
import { Modal } from '../ui/Modal.jsx';
import { Select } from '../ui/Select.jsx';

// Тот же набор, что SCHEDULE_TYPE_OPTIONS в GroupFormModal.jsx — тип
// расписания группы (чёт/нечёт/по дням недели).
const SCHEDULE_TYPE_OPTIONS = [
  { value: 'even', label: 'Чётные дни' },
  { value: 'odd', label: 'Нечётные дни' },
  { value: 'weekdays', label: 'По дням недели' },
];

/**
 * Просмотр свободных мест — только для чтения, ничего не бронирует.
 * Бронь происходит сама, когда оператор назначает лиду пробный
 * (trialCourseId/trialDate уже несут всё нужное) — это окно просто
 * показывает текущую занятость пула лотов курс+время+Дни, чтобы оператор
 * видел, есть ли ещё место, прежде чем звать лида на пробный.
 * @param {Object} props
 * @param {Object|null} props.lead только для заголовка, в подсчёт занятости не участвует
 * @param {Array<Object>} props.allLeads полный список лидов доски — для подсчёта занятости без лишнего запроса
 * @param {() => void} props.onClose
 */
export function GroupBookingModal({ lead, allLeads, onClose }) {
  const { activeBranchId } = useBranch();
  const [courseId, setCourseId] = useState('');
  const [scheduleType, setScheduleType] = useState('');
  const [time, setTime] = useState('');

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

  const timeOptions = useMemo(
    () =>
      [
        ...new Set(
          allGroups
            .filter((g) => g.courseId === courseId && g.schedule?.type === scheduleType)
            .map((g) => g.schedule?.time)
            .filter(Boolean),
        ),
      ].sort(),
    [allGroups, courseId, scheduleType],
  );

  const occupancy = useMemo(() => {
    if (!courseId || !scheduleType || !time) return null;
    return computeSlotOccupancy({ groups: allGroups, leads: allLeads, courseId, time, scheduleType });
  }, [allGroups, allLeads, courseId, scheduleType, time]);

  const rows = useMemo(
    () => (occupancy ? distributeOccupancy(occupancy.matchingGroups, occupancy.occupiedCount) : []),
    [occupancy],
  );

  if (!lead) return null;

  return (
    <Modal open={Boolean(lead)} onClose={onClose} title={`Свободные места: ${lead.fullName}`}>
      <div className="flex flex-col gap-4">
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

        {occupancy && (
          <div className="flex flex-col gap-2">
            {occupancy.matchingGroups.length === 0 ? (
              <p className="text-[13px] text-muted">Групп с таким временем нет.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 rounded-field bg-surface-alt p-3">
                  <span className="text-[13px] font-bold text-text">
                    Занято лотов: {occupancy.occupiedCount} из {occupancy.totalSlots}
                  </span>
                  <div className="flex gap-1">
                    {Array.from({ length: occupancy.totalSlots }, (_, i) => (
                      <span
                        key={i}
                        className={`h-2.5 w-2.5 rounded-full ${i < occupancy.occupiedCount ? 'bg-navy' : 'bg-border-strong'}`}
                      />
                    ))}
                  </div>
                </div>

                {occupancy.occupiedCount >= occupancy.totalSlots && (
                  <p className="rounded-field bg-danger/10 p-3 text-[13px] font-bold text-danger">
                    Все лоты на это время заняты — свободных мест для нового пробного нет.
                  </p>
                )}

                {rows.map(({ group, occupied }) => (
                  <div key={group.id} className="flex items-center justify-between gap-3 rounded-field border border-border-strong p-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold text-text">{group.code}</p>
                      <p className="text-[12px] text-muted">{group.studentsCount ?? 0} учеников</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {Array.from({ length: SLOTS_PER_GROUP }, (_, i) => (
                        <span key={i} className={`h-3 w-3 rounded-full border ${
                          i < occupied ? 'border-navy bg-navy' : 'border-border-strong bg-transparent'
                        }`} />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
