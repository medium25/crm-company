import { useState } from 'react';
import { Card } from '../ui/Card.jsx';
import { RoomScheduleView } from '../dashboard/RoomScheduleView.jsx';
import { clampCapacity, nextRoomName } from '../../lib/roomSchedule.js';

const INITIAL_ROOMS = [
  { id: 'r1', name: '4' },
  { id: 'r2', name: '5' },
  { id: 'r3', name: '6' },
  { id: 'r4', name: '7' },
];

function group(id, code, courseName, teacherId, teacherName, roomId, time, studentsCount, capacity, type = 'even') {
  return { id, code, courseName, teacherId, teacherName, roomId, studentsCount, capacity, schedule: { type, time } };
}

const INITIAL_GROUPS = [
  group('g1', 'IJI17', 'INGLIZ TILI', 't1', 'MR IBROHIM', 'r1', '17:00', 7, 8),
  group('g2', 'IJI18', 'INGLIZ TILI', 't1', 'MR IBROHIM', 'r1', '18:30', 3, 8),
  group('g3', 'RJK9', 'RUS TILI', 't2', 'MS KRISTINA', 'r2', '09:00', 6, 8),
  group('g4', 'RJK10', 'RUS TILI', 't2', 'MS KRISTINA', 'r2', '10:30', 4, 8),
  group('g5', 'RJSh17', 'RUS TILI', 't3', 'MS SHAXZODA', 'r2', '17:00', 6, 8),
  group('g6', 'RJSh18', 'RUS TILI', 't3', 'MS SHAXZODA', 'r2', '18:30', 10, 10),
  group('g7', 'RJZ14', 'RUS TILI', 't4', 'MS ZIYODA', 'r3', '14:00', 3, 8),
  group('g8', 'RJZ15', 'RUS TILI', 't4', 'MS ZIYODA', 'r3', '15:30', 6, 8),
  group('g9', 'RJZ17', 'RUS TILI', 't4', 'MS ZIYODA', 'r3', '17:00', 3, 8),
  group('g10', 'RJZ18', 'RUS TILI', 't4', 'MS ZIYODA', 'r3', '18:30', 6, 6),
  group('g11', 'IJI19', 'INGLIZ TILI', 't1', 'MR IBROHIM', 'r4', '12:00', 5), // вместимость по умолчанию (12)
  group('g12', 'RJK11', 'RUS TILI', 't2', 'MS KRISTINA', 'r4', '15:30', 9, 8), // больше, чем мест
  // Нечётные дни и дни недели: чтобы вкладки показывали данные, а цвета учителей не прыгали.
  group('g13', 'IJI20', 'INGLIZ TILI', 't1', 'MR IBROHIM', 'r1', '10:30', 8, 10, 'odd'),
  group('g14', 'RJK12', 'RUS TILI', 't2', 'MS KRISTINA', 'r2', '14:00', 5, 8, 'odd'),
  group('g15', 'RJZ19', 'RUS TILI', 't4', 'MS ZIYODA', 'r3', '09:00', 7, 8, 'weekdays'),
];

// Записанные на пробный по группам (в дашборде их считает groupTrialCounts по лидам).
const INITIAL_TRIALS = { g1: 1, g3: 1, g5: 2, g8: 1, g11: 2, g12: 1, g13: 1 };

/** Витрина «Расписание кабинетов»: локальное состояние и данные примера, без Firestore. */
export function RoomScheduleShowcase() {
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [groups, setGroups] = useState(INITIAL_GROUPS);
  const [dayType, setDayType] = useState('even');
  const [notice, setNotice] = useState('');
  const [opened, setOpened] = useState('');
  const [nextId, setNextId] = useState(5);

  const visibleGroups = groups.filter((g) => g.schedule.type === dayType);

  function addRoom() {
    setNotice('');
    setRooms((rs) => [...rs, { id: `r${nextId}`, name: nextRoomName(rs) }]);
    setNextId((n) => n + 1);
  }

  function removeRoom(id) {
    const room = rooms.find((r) => r.id === id);
    if (!room) return;
    if (groups.some((g) => g.roomId === id)) {
      setNotice(`В кабинете «${room.name}» есть группы. Сначала переведите их в другой кабинет.`);
      return;
    }
    setNotice('');
    setRooms((rs) => rs.filter((r) => r.id !== id));
  }

  function removeLastRoom() {
    const last = rooms[rooms.length - 1];
    if (last) removeRoom(last.id);
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <RoomScheduleView
          rooms={rooms}
          groups={visibleGroups}
          dayType={dayType}
          onDayTypeChange={setDayType}
          onRenameRoom={(id, name) => setRooms((rs) => rs.map((r) => (r.id === id ? { ...r, name } : r)))}
          onChangeCapacity={(id, capacity) =>
            setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, capacity: clampCapacity(capacity) } : g)))
          }
          onAddRoom={addRoom}
          onRemoveLastRoom={removeLastRoom}
          onRemoveRoom={removeRoom}
          trialCounts={INITIAL_TRIALS}
          onOpenGroup={(id) => setOpened(groups.find((g) => g.id === id)?.code ?? '')}
          notice={notice}
        />
      </Card>
      <p className="text-small text-muted">
        {opened ? `Нажата группа ${opened}: в дашборде здесь переход на страницу группы.` : 'Данные примерные. Нажмите на код группы, чтобы проверить переход.'}
      </p>
    </div>
  );
}
