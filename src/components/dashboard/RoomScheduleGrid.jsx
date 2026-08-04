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

const SLOT_MINUTES = 30;
const DAY_START = 8 * 60; // 08:00
const DAY_END = 21 * 60; // 21:00
const SLOT_HEIGHT = 36; // px
const TIME_COL_WIDTH = 56; // px
const ROOM_COL_WIDTH = 160; // px
const HEADER_HEIGHT = 32; // px

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatSlotLabel(minutes) {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Сетка расписания по кабинетам — время × кабинет, занятые слоты показывают
 * группу. Реальный аналог этого блока на дашборде Modme (переключатель
 * «Чётные/Нечётные/По дням недели»), а не придуманный «Должники + уроки
 * сегодня» из первой версии.
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

  const slots = useMemo(() => {
    const list = [];
    for (let t = DAY_START; t < DAY_END; t += SLOT_MINUTES) list.push(t);
    return list;
  }, []);

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
          <div className="flex" style={{ minWidth: TIME_COL_WIDTH + rooms.length * ROOM_COL_WIDTH }}>
            <div className="shrink-0 border-r border-border" style={{ width: TIME_COL_WIDTH }}>
              <div style={{ height: HEADER_HEIGHT }} />
              {slots.map((s) => (
                <div
                  key={s}
                  className={`flex items-start justify-end pr-2 text-[12px] ${s % 60 === 0 ? 'font-bold text-text' : 'text-muted'}`}
                  style={{ height: SLOT_HEIGHT }}
                >
                  {s % 60 === 0 ? formatSlotLabel(s) : ''}
                </div>
              ))}
            </div>

            {rooms.map((room) => {
              const roomGroups = filteredGroups.filter((g) => g.roomId === room.id);
              return (
                <div key={room.id} className="flex-1 border-r border-border" style={{ minWidth: ROOM_COL_WIDTH }}>
                  <div className="flex items-center justify-center text-[15px] font-bold text-text" style={{ height: HEADER_HEIGHT }}>
                    {room.name}
                  </div>
                  <div
                    className="relative"
                    style={{
                      height: slots.length * SLOT_HEIGHT,
                      backgroundImage: `repeating-linear-gradient(to bottom, #E9EBEF, #E9EBEF 1px, transparent 1px, transparent ${SLOT_HEIGHT}px)`,
                    }}
                  >
                    {roomGroups.map((g) => {
                      const start = toMinutes(g.schedule.time);
                      const top = ((start - DAY_START) / SLOT_MINUTES) * SLOT_HEIGHT;
                      const height = (g.schedule.durationMin / SLOT_MINUTES) * SLOT_HEIGHT;
                      if (top < 0 || top >= slots.length * SLOT_HEIGHT) return null;
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => navigate(`/groups/${g.id}`)}
                          className="absolute left-1 right-1 flex flex-col justify-center overflow-hidden rounded-field border border-navy/20 bg-orange-soft px-2 py-1 text-left hover:opacity-80"
                          style={{ top, height: Math.max(height, SLOT_HEIGHT) }}
                          title={`${g.code} · ${g.courseName} · ${g.teacherName}`}
                        >
                          <span className="truncate text-[12px] font-bold text-navy">{g.code} · {g.courseName}</span>
                          <span className="truncate text-[11px] text-muted">{g.teacherName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
