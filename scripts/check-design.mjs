// Проверка единого дизайн-кода: node scripts/check-design.mjs [--strict]
// LEGACY — пути, ещё не переведённые на токены; сужается по этапам (docs/superpowers/plans/2026-09-29-design-tokens.md).
// --strict игнорирует LEGACY и показывает полный список работы.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSource, isLegacy } from './lib/design-rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAN = ['src/components', 'src/pages'];

const LEGACY = [
  'src/pages/',
  'src/components/billing/',
  'src/components/charts/',
  'src/components/dashboard/',
  'src/components/dev/',
  'src/components/groups/',
  'src/components/layout/',
  'src/components/leads/',
  'src/components/payments/',
  'src/components/settings/',
  'src/components/shared/',
  'src/components/students/',
  'src/components/teachers/',
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|mjs)$/.test(name)) yield p;
  }
}

const strict = process.argv.includes('--strict');
const violations = [];
let skipped = 0;

for (const root of SCAN) {
  for (const abs of walk(join(ROOT, root))) {
    const rel = relative(ROOT, abs).split('\\').join('/');
    if (!strict && isLegacy(rel, LEGACY)) {
      skipped += 1;
      continue;
    }
    violations.push(...checkSource(readFileSync(abs, 'utf8'), rel));
  }
}

for (const v of violations) console.log(`${v.file}:${v.line}  ${v.rule}  ${v.found}  →  ${v.hint}`);
if (!strict && skipped) console.log(`(пропущено legacy-файлов: ${skipped})`);
console.log(violations.length ? `\ncheck-design: нарушений ${violations.length}` : 'check-design: ок');
process.exit(violations.length ? 1 : 0);
