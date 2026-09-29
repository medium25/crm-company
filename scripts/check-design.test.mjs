import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSource, isLegacy } from './lib/design-rules.mjs';

const rules = (text, path = 'src/pages/X.jsx') => checkSource(text, path).map((v) => v.rule);

test('text-[13px] нарушение', () => {
  assert.deepEqual(rules('<p className="text-[13px] text-muted">'), ['text-px']);
});

test('токены размеров без нарушений', () => {
  assert.deepEqual(rules('<p className="text-small text-caption text-kpi">'), []);
});

test('tailwind text-xl / text-xs нарушение', () => {
  assert.deepEqual(rules('<h2 className="text-xl">'), ['text-default']);
  assert.deepEqual(rules('<i className="text-xs">'), ['text-default']);
});

test('hex в разметке нарушение, в chartColors.js и columns.js можно', () => {
  assert.deepEqual(rules("<i className=\"bg-[#EEF0F3]\">"), ['hex']);
  assert.deepEqual(rules("grid: '#E9EBEF'", 'src/lib/chartColors.js'), []);
  assert.deepEqual(rules("color: '#2F6FE4'", 'src/components/leads/columns.js'), []);
});

test('rgba в классе нарушение', () => {
  assert.deepEqual(rules('<div className="bg-[rgba(0,0,0,.4)]">'), ['rgba-class']);
});

test('rounded-xl/lg/2xl и голый rounded нарушение', () => {
  assert.deepEqual(rules('<div className="rounded-xl">'), ['rounded']);
  assert.deepEqual(rules('<div className="p-2 rounded bg-white">'), ['rounded']);
  assert.deepEqual(rules('<div className="rounded-[13px]">'), ['rounded']);
});

test('rounded-full/field/card/row/badge и rounded-t-field можно', () => {
  assert.deepEqual(
    rules('<div className="rounded-full rounded-field rounded-card rounded-row rounded-badge rounded-t-field">'),
    [],
  );
});

test('комментарии и design-ok пропускаются', () => {
  assert.deepEqual(rules('  // было text-[13px] и #E9B949'), []);
  assert.deepEqual(rules('  * rounded-xl в описании'), []);
  assert.deepEqual(rules("const c = '#8B94A3'; // design-ok: цвет оператора из данных"), []);
});

test('номер строки и найденный фрагмент', () => {
  const v = checkSource('a\n<p className="text-[9px]">', 'src/pages/X.jsx');
  assert.equal(v[0].line, 2);
  assert.equal(v[0].found, 'text-[9px]');
});

test('isLegacy по префиксу пути', () => {
  assert.equal(isLegacy('src/pages/TasksPage.jsx', ['src/pages/TasksPage.jsx']), true);
  assert.equal(isLegacy('src/components/leads/LeadCard.jsx', ['src/components/leads/']), true);
  assert.equal(isLegacy('src/components/ui/Button.jsx', ['src/components/leads/']), false);
});
