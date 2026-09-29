// Кодмод: механическая замена off-token классов на токены.
// Запуск: node scripts/migrate-design.mjs <файл…>. Не трогает h-*, hex и rounded-[..] — это вручную (см. план).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TEXT_MAP = {
  9: 'caption', 10: 'caption', 11: 'caption', 12: 'caption',
  13: 'small', 14: 'body', 15: 'control', 17: 'title',
  20: 'page', 22: 'page', 28: 'kpi', 32: 'kpi', 34: 'kpi',
};

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*|\{\/\*)/;

function migrateLine(line) {
  return line
    .replace(/\btext-\[(\d+)px\]/g, (m, n) => (TEXT_MAP[n] ? `text-${TEXT_MAP[n]}` : m))
    .replace(/\btext-xs\b/g, 'text-caption')
    .replace(/\btext-xl\b/g, 'text-title')
    .replace(/\brounded-2xl\b/g, 'rounded-card')
    .replace(/\brounded-xl\b/g, 'rounded-row')
    .replace(/\brounded-(?:lg|md)\b/g, 'rounded-field')
    .replace(/\brounded-sm\b/g, 'rounded-badge')
    .replace(/(?<=[\s"'`{])rounded(?=[\s"'`}])/g, 'rounded-badge');
}

/** @param {string} text @returns {string} */
export function migrateSource(text) {
  return text
    .split('\n')
    .map((line) => (COMMENT_LINE.test(line) ? line : migrateLine(line)))
    .join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) {
    const before = readFileSync(file, 'utf8');
    const after = migrateSource(before);
    if (after !== before) {
      writeFileSync(file, after);
      console.log(`изменён: ${file}`);
    }
  }
}
