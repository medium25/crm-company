// scripts/test-lead-assignment.mjs
// Разовая проверка чистой логики расписания операторов — без фреймворка,
// по образцу scripts/test-leads-api.mjs. Запуск: node scripts/test-lead-assignment.mjs
import assert from 'node:assert/strict';
import { isOperatorWorkingAt, selectOnShiftOperatorIds } from '../src/lib/leadFunnel.js';

// Среда, 19.08.2026, 10:00 — оператор A работает 09:00-14:00, B — 14:00-18:00
const wed10am = new Date(2026, 7, 19, 10, 0);
assert.equal(wed10am.getDay(), 3, 'проверь дату теста — ожидалась среда');

const scheduleA = [null, { start: '09:00', end: '18:00' }, { start: '09:00', end: '18:00' }, { start: '09:00', end: '14:00' }, { start: '09:00', end: '18:00' }, { start: '09:00', end: '18:00' }, null];
const scheduleB = [null, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, { start: '14:00', end: '18:00' }, null];

assert.equal(isOperatorWorkingAt(scheduleA, wed10am), true, 'A работает в 10:00 по среде (09-14)');
assert.equal(isOperatorWorkingAt(scheduleB, wed10am), false, 'B ещё не начал (14-18)');
assert.equal(isOperatorWorkingAt(undefined, wed10am), true, 'нет расписания — тех.дефолт "всегда работает"');

const sunday = new Date(2026, 7, 16, 10, 0);
assert.equal(sunday.getDay(), 0, 'проверь дату теста — ожидалось воскресенье');
assert.equal(isOperatorWorkingAt(scheduleA, sunday), false, 'воскресенье — null в расписании, явный выходной');

const boundary = new Date(2026, 7, 19, 14, 0);
assert.equal(isOperatorWorkingAt(scheduleA, boundary), false, '14:00 — уже вне 09:00-14:00 (end не включён)');
assert.equal(isOperatorWorkingAt(scheduleB, boundary), true, '14:00 — начало смены B (start включён)');

const operators = [
  { id: 'opA', workSchedule: scheduleA },
  { id: 'opB', workSchedule: scheduleB },
];
assert.deepEqual(selectOnShiftOperatorIds(operators, wed10am), ['opA'], 'в 10:00 работает только A');

const afterHours = new Date(2026, 7, 19, 20, 0);
assert.deepEqual(selectOnShiftOperatorIds(operators, afterHours), [], 'в 20:00 не работает никто — пустой список, fallback решает вызывающая сторона');

console.log('OK: lead-assignment schedule tests passed');
