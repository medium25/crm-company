import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSource } from './migrate-design.mjs';

test('размеры текста', () => {
  assert.equal(migrateSource('<p className="text-[13px] text-[15px] text-[34px]">'), '<p className="text-small text-control text-kpi">');
  assert.equal(migrateSource('text-[9px] text-[10px] text-[11px] text-[12px]'), 'text-caption text-caption text-caption text-caption');
  assert.equal(migrateSource('text-[14px] text-[17px] text-[20px] text-[22px]'), 'text-body text-title text-page text-page');
});

test('неизвестный размер остаётся, чтобы его поймала проверка', () => {
  assert.equal(migrateSource('text-[18px]'), 'text-[18px]');
});

test('tailwind text-xs / text-xl', () => {
  assert.equal(migrateSource('text-xs font-bold'), 'text-caption font-bold');
  assert.equal(migrateSource('text-xl font-bold'), 'text-title font-bold');
});

test('радиусы', () => {
  assert.equal(migrateSource('rounded-2xl rounded-xl rounded-lg rounded-md rounded-sm'), 'rounded-card rounded-row rounded-field rounded-field rounded-badge');
  assert.equal(migrateSource('<i className="p-1 rounded bg-white">'), '<i className="p-1 rounded-badge bg-white">');
});

test('rounded-full/field/t-… и rounded-[..] не трогаются', () => {
  const s = 'rounded-full rounded-field rounded-t-field rounded-[13px]';
  assert.equal(migrateSource(s), s);
});

test('комментарии не трогаются', () => {
  const s = '  // rounded-xl и text-[13px] в описании';
  assert.equal(migrateSource(s), s);
});
