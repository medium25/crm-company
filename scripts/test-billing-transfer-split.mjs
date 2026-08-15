// scripts/test-billing-transfer-split.mjs
// Разовая проверка чистых формул дробления списания/оплаты при переводе
// студента — без фреймворка, по образцу scripts/test-lead-assignment.mjs.
// Запуск: node scripts/test-billing-transfer-split.mjs
import assert from 'node:assert/strict';
import { chargeAmountForLessons, defaultPaymentSplitAmount } from '../src/lib/billing.js';

// 12 уроков в месяц, цена 600000 — 50000 за урок
const enrollment = { price: 600000 };
const group = { lessonsPerMonth: 12 };

assert.equal(chargeAmountForLessons(enrollment, group, 6), -300000, '6 из 12 уроков — половина суммы');
assert.ok(Object.is(chargeAmountForLessons(enrollment, group, 0), 0), '0 уроков — чистый 0, не -0');
assert.equal(chargeAmountForLessons(enrollment, group, 12), -600000, 'все 12 — полная сумма');
assert.ok(Object.is(chargeAmountForLessons({ price: 0 }, group, 5), 0), 'нулевая цена — чистый 0, не -0');

// округление: цена не делится ровно на число уроков
const oddEnrollment = { price: 100000 };
const oddGroup = { lessonsPerMonth: 3 };
assert.equal(chargeAmountForLessons(oddEnrollment, oddGroup, 1), -33333, 'округление до целого');

assert.equal(defaultPaymentSplitAmount(600000, 6, 12), 300000, 'половина оплаты — новой группе');
assert.equal(defaultPaymentSplitAmount(600000, 0, 12), 0, 'ничего не осталось новой группе');
assert.equal(defaultPaymentSplitAmount(600000, 12, 12), 600000, 'вся оплата — новой группе');
assert.equal(defaultPaymentSplitAmount(600000, 6, 0), 0, 'totalLessons=0 — защита от деления на 0');

console.log('OK: billing transfer-split tests passed');
