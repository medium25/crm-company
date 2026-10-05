import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GROUP_CAPACITY, ROOMS_PER_ROW, groupCapacity, clampCapacity, chunkRooms, seatStates, fillTone,
  blockTimes, teacherStats, nextRoomName, teacherColorIndex,
  LESSON_MINUTES, roomHueIndex, timeToMinutes, minutesToTime, meetsOnDate, roomStatus, roomLoad, groupTrialCounts,
} from '../src/lib/roomSchedule.js';

test('вместимость по умолчанию 12', () => {
  assert.equal(DEFAULT_GROUP_CAPACITY, 12);
  assert.equal(groupCapacity({}), 12);
  assert.equal(groupCapacity({ capacity: undefined }), 12);
  assert.equal(groupCapacity({ capacity: 'x' }), 12);
});

test('вместимость группы из поля и границы 1…30', () => {
  assert.equal(groupCapacity({ capacity: 8 }), 8);
  assert.equal(groupCapacity({ capacity: 0 }), 12);
  assert.equal(groupCapacity({ capacity: 99 }), 30);
  assert.equal(clampCapacity(0), 1);
  assert.equal(clampCapacity(31), 30);
  assert.equal(clampCapacity(7.6), 8);
});

test('кабинеты по 3 в блоке', () => {
  assert.equal(ROOMS_PER_ROW, 3);
  const r = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id }));
  assert.deepEqual(chunkRooms(r).map((b) => b.map((x) => x.id)), [[1, 2, 3], [4, 5, 6], [7]]);
  assert.deepEqual(chunkRooms(r, 2).map((b) => b.map((x) => x.id)), [[1, 2], [3, 4], [5, 6], [7]]);
  assert.deepEqual(chunkRooms([]), []);
});

test('места: занято, свободно, больше мест', () => {
  assert.deepEqual(seatStates(2, 4), ['full', 'full', 'free', 'free']);
  assert.deepEqual(seatStates(3, 3), ['full', 'full', 'full']);
  assert.deepEqual(seatStates(5, 3), ['full', 'full', 'full', 'over', 'over']);
  assert.deepEqual(seatStates(0, 2), ['free', 'free']);
});

test('цвет заполнения', () => {
  assert.equal(fillTone(3, 8), 'ok');
  assert.equal(fillTone(5, 8), 'ok');
  assert.equal(fillTone(6, 8), 'mid');
  assert.equal(fillTone(7, 8), 'mid');
  assert.equal(fillTone(8, 8), 'full');
  assert.equal(fillTone(9, 8), 'full');
});

test('времена блока: уникальные и по возрастанию, только свои кабинеты', () => {
  const g = [
    { roomId: 'a', schedule: { time: '17:00' } },
    { roomId: 'a', schedule: { time: '09:00' } },
    { roomId: 'b', schedule: { time: '17:00' } },
    { roomId: 'c', schedule: { time: '12:00' } },
    { roomId: 'a', schedule: {} },
  ];
  assert.deepEqual(blockTimes(g, ['a', 'b']), ['09:00', '17:00']);
  assert.deepEqual(blockTimes(g, ['zzz']), []);
});

test('учителя: ученики и группы по времени', () => {
  const g = [
    { id: '1', teacherId: 't2', teacherName: 'B', studentsCount: 3, schedule: { time: '18:00' } },
    { id: '2', teacherId: 't1', teacherName: 'A', studentsCount: 5, schedule: { time: '17:00' } },
    { id: '3', teacherId: 't2', teacherName: 'B', studentsCount: 4, schedule: { time: '09:00' } },
    { id: '4', teacherId: 't1', teacherName: 'A', schedule: { time: '12:00' } },
  ];
  const s = teacherStats(g);
  assert.deepEqual(s.map((x) => [x.name, x.students]), [['A', 5], ['B', 7]]);
  assert.deepEqual(s[0].groups.map((x) => x.id), ['4', '2']);
  assert.deepEqual(s[1].groups.map((x) => x.id), ['3', '1']);
});

test('название нового кабинета: следующее число', () => {
  assert.equal(nextRoomName([{ name: '4' }, { name: '10' }, { name: 'Большой' }]), '11');
  assert.equal(nextRoomName([{ name: 'А' }, { name: 'Б' }]), '3');
  assert.equal(nextRoomName([]), '1');
});

test('цвет учителя: стабильный индекс 1…7 по ключу', () => {
  for (const key of ['t1', 't2', 'MR IBROHIM', 'Ms Kristina', 'x', '12345abcde']) {
    const i = teacherColorIndex(key);
    assert.ok(Number.isInteger(i) && i >= 1 && i <= 7, `индекс ${i} для ${key}`);
    assert.equal(teacherColorIndex(key), i);
    assert.equal(teacherColorIndex(key), i);
  }
  assert.notEqual(teacherColorIndex('t1'), teacherColorIndex('t2'));
});

test('цвет учителя: пустой и неожиданный ключ не ломают', () => {
  for (const key of ['', undefined, null, 42]) {
    const i = teacherColorIndex(key);
    assert.ok(Number.isInteger(i) && i >= 1 && i <= 7);
  }
  assert.equal(teacherColorIndex(''), teacherColorIndex(undefined));
});

test('оттенок кабинета 1…7 по кругу', () => {
  assert.equal(roomHueIndex(0), 1);
  assert.equal(roomHueIndex(6), 7);
  assert.equal(roomHueIndex(7), 1);
  assert.equal(roomHueIndex(15), 2);
});

test('места с пробными: ученик, пробный, свободно, больше мест', () => {
  assert.deepEqual(seatStates(2, 5, 1), ['full', 'full', 'trial', 'free', 'free']);
  assert.deepEqual(seatStates(3, 4, 1), ['full', 'full', 'full', 'trial']);
  assert.deepEqual(seatStates(3, 4, 3), ['full', 'full', 'full', 'trial', 'over', 'over']);
  assert.deepEqual(seatStates(5, 3, 1), ['full', 'full', 'full', 'over', 'over', 'over']);
  assert.deepEqual(seatStates(2, 3), ['full', 'full', 'free']);
});

test('цвет заполнения учитывает пробных', () => {
  assert.equal(fillTone(4, 8), 'ok');
  assert.equal(fillTone(4, 8, 2), 'mid');
  assert.equal(fillTone(6, 8, 2), 'full');
});

test('время в минуты и обратно', () => {
  assert.equal(LESSON_MINUTES, 90);
  assert.equal(timeToMinutes('17:20'), 1040);
  assert.equal(minutesToTime(1040), '17:20');
  assert.equal(minutesToTime(timeToMinutes('09:05') + 90), '10:35');
});

test('группа проходит в этот день: чётный, нечётный, по дням недели', () => {
  const even = { schedule: { type: 'even' } };
  const odd = { schedule: { type: 'odd' } };
  const wd = { schedule: { type: 'weekdays', weekdays: [1, 3] } };
  const d6 = new Date(2026, 9, 6); // вторник, 6 число
  const d7 = new Date(2026, 9, 7); // среда, 7 число
  assert.equal(meetsOnDate(even, d6), true);
  assert.equal(meetsOnDate(even, d7), false);
  assert.equal(meetsOnDate(odd, d7), true);
  assert.equal(meetsOnDate(wd, d7), true);
  assert.equal(meetsOnDate(wd, d6), false);
  assert.equal(meetsOnDate({ schedule: {} }, d6), false);
});

test('статус кабинета сейчас', () => {
  const g = (id, time) => ({ id, code: id, schedule: { time } });
  const gs = [g('a', '09:00'), g('b', '17:00'), g('c', '18:30')];
  assert.deepEqual(roomStatus([], 600), { kind: 'empty' });
  assert.deepEqual(roomStatus(gs, 600, () => false), { kind: 'none' });
  let s = roomStatus(gs, timeToMinutes('17:20'));
  assert.equal(s.kind, 'live');
  assert.equal(s.group.id, 'b');
  assert.equal(s.endsAt, '18:30');
  s = roomStatus(gs, timeToMinutes('12:00'));
  assert.equal(s.kind, 'next');
  assert.equal(s.group.id, 'b');
  s = roomStatus(gs, timeToMinutes('20:30'));
  assert.deepEqual(s, { kind: 'done' });
  s = roomStatus(gs, timeToMinutes('09:10'), (x) => x.id !== 'a');
  assert.equal(s.kind, 'next');
});

test('загрузка кабинета: занятия, места, занято, процент', () => {
  const gs = [
    { id: 'a', studentsCount: 6, capacity: 8 },
    { id: 'b', studentsCount: 3 }, // вместимость по умолчанию 12
  ];
  assert.deepEqual(roomLoad(gs, { a: 1 }), { lessons: 2, seats: 20, used: 10, pct: 50 });
  assert.deepEqual(roomLoad([], {}), { lessons: 0, seats: 0, used: 0, pct: 0 });
  assert.equal(roomLoad([{ id: 'x', studentsCount: 30, capacity: 5 }], {}).pct, 100);
});

test('пробные по группам: по курсу, времени, чётности, без прошедших', () => {
  const g = (id, courseId, time, type = 'even', extra = {}) => ({ id, courseId, schedule: { time, type, ...extra } });
  const dt = (d, h, m) => ({ toDate: () => new Date(2026, 9, d, h, m) });
  const lead = (courseId, date, stage = 'trial_scheduled') => ({ funnelStage: stage, trialCourseId: courseId, trialDate: date });
  const today = new Date(2026, 9, 6, 8, 0);
  const groups = [g('g1', 'c1', '17:00'), g('g2', 'c1', '17:00'), g('g3', 'c1', '18:30'), g('g4', 'c2', '17:00', 'odd')];
  const leads = [
    lead('c1', dt(6, 17, 0)),
    lead('c1', dt(8, 17, 0)),
    lead('c1', dt(10, 17, 0)),
    lead('c1', dt(7, 17, 0)), // нечётный день, чётные группы не подходят
    lead('c1', dt(1, 17, 0)), // прошлое
    lead('c1', dt(6, 18, 30), 'closing'), // не назначенный пробный
    lead('c2', dt(7, 17, 0)),
  ];
  assert.deepEqual(groupTrialCounts(groups, leads, today), { g1: 2, g2: 1, g3: 0, g4: 1 });
  assert.deepEqual(groupTrialCounts([], leads, today), {});
  assert.deepEqual(groupTrialCounts(groups, [], today), { g1: 0, g2: 0, g3: 0, g4: 0 });
});

test('пробные: группы слота по дням недели с разными днями не теряют пробный', () => {
  const groups = [
    { id: 'w1', courseId: 'c1', schedule: { time: '17:00', type: 'weekdays', weekdays: [1, 3] } },
    { id: 'w2', courseId: 'c1', schedule: { time: '17:00', type: 'weekdays', weekdays: [2, 4] } },
  ];
  const leads = [{ funnelStage: 'trial_scheduled', trialCourseId: 'c1', trialDate: { toDate: () => new Date(2026, 9, 6, 17, 0) } }];
  assert.deepEqual(groupTrialCounts(groups, leads, new Date(2026, 9, 6, 8, 0)), { w1: 1, w2: 0 });
});

test('загрузка кабинета: нечисловое studentsCount не даёт NaN', () => {
  assert.deepEqual(roomLoad([{ id: 'x', studentsCount: 'abc', capacity: 5 }], {}), { lessons: 1, seats: 5, used: 0, pct: 0 });
});
