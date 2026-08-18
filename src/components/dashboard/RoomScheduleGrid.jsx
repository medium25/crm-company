import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { CalendarClock } from 'lucide-react';

const DAY_TYPE_TABS = [
  { value: 'even', label: 'Чётные дни' },
  { value: 'odd', label: 'Нечётные дни' },
  { value: 'weekdays', label: 'По дням недели' },
];

/**
 * Сетка расписания по кабинетам — время × кабинет, занятые слоты показывают
 * группу с числом студентов. Строки — фактические времена начала групп
 * этого типа расписания (не непрерывная временная шкала как в календаре) —
 * ряд «09:00» и напротив него карточки групп, что стартуют в 09:00.
 * @param {Object} props
 * @param {string} props.branchId
 */
export function RoomScheduleGrid({ branchId }) {
  const navigate = useNavigate();
  const [dayType, setDayType] = useState('even');

  const groupsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'groups'), where('branchId', '==', branchId), where('isArchived', '==', false), where('status', '==', 'active')) : null),
    [branchId],
  );
  const { data: groups, loading: groupsLoading } = useCollection(groupsQuery);

  const roomsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'rooms'), where('branchId', '==', branchId), where('isArchived', '==', false), orderBy('name')) : null),
    [branchId],
  );
  const { data: rooms, loading: roomsLoading } = useCollection(roomsQuery);

  const filteredGroups = useMemo(() => groups.filter((g) => g.schedule.type === dayType), [groups, dayType]);

  const timeSlots = useMemo(
    () => [...new Set(filteredGroups.map((g) => g.schedule?.time).filter(Boolean))].sort(),
    [filteredGroups],
  );

  const loading = groupsLoading || roomsLoading;

  return (
    <Card>
      <h3 className="mb-4 text-[20px] font-bold text-text">Расписание кабинетов</h3>

      <div className="mb-4 flex gap-2">
        {DAY_TYPE_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setDayType(t.value)}
            className={`rounded-full px-3 py-1.5 text-[13px] ${
              dayType === t.value ? 'bg-navy text-white' : 'bg-surface-alt text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!loading && rooms.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Кабинеты не заведены" />
      ) : !loading && filteredGroups.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Нет групп с таким типом расписания" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="w-16 border-b border-r border-border p-2" />
                {rooms.map((room) => (
                  <th
                    key={room.id}
                    className="min-w-[170px] border-b border-r border-border p-2 text-center text-[15px] font-bold text-text"
                  >
                    {room.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot) => (
                <tr key={slot}>
                  <td className="border-b border-r border-border p-2 text-right align-top text-[13px] font-bold text-text">
                    {slot}
                  </td>
                  {rooms.map((room) => {
                    const cellGroups = filteredGroups.filter((g) => g.roomId === room.id && g.schedule?.time === slot);
                    return (
                      <td key={room.id} className="border-b border-r border-border p-1.5 align-top">
                        <div className="flex flex-col gap-1">
                          {cellGroups.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => navigate(`/groups/${g.id}`)}
                              className="flex flex-col rounded-field border border-navy/20 bg-orange-soft px-2 py-1 text-left hover:opacity-80"
                              title={`${g.code} · ${g.courseName} · ${g.teacherName}`}
                            >
                              <span className="truncate text-[12px] font-bold text-navy">
                                {g.code} · {g.courseName}
                              </span>
                              <span className="truncate text-[11px] text-muted">
                                {g.studentsCount ?? 0} студ. · {g.teacherName}
                              </span>
                            </button>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
