import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GROUP_CAPACITY, ROOMS_PER_ROW, groupCapacity, clampCapacity, chunkRooms, seatStates, fillTone,
  blockTimes, teacherStats, nextRoomName, teacherColorIndex,
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
