import { readFileSync } from 'fs';

function normName(s) {
  return s.replace(/[`’‘]/g, "'").trim().toLowerCase();
}
function parseRow(line) {
  const cols = line.split('\t');
  if (cols.length < 8) return null;
  const [date, name, sumRaw, method, teacher, group, creator, createdAt] = cols;
  const amount = Number(sumRaw.replace(/[^\d]/g, ''));
  return { date, name: name.trim(), amount, method, teacher, group, creator, createdAt: createdAt.trim() };
}

const files = Array.from({ length: 25 }, (_, i) => i + 1).map((n) => `scripts/_phase2_raw_page${n}.txt`);
const julyRows = [];
const seen = new Map();
let dupCount = 0;
let dupSum = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const row = parseRow(line);
    if (!row) continue;
    const key = `${row.name}|${row.amount}|${row.createdAt}`;
    if (seen.has(key)) {
      dupCount++;
      dupSum += row.amount;
      console.log('DUP:', f, key, seen.get(key));
    } else {
      seen.set(key, f);
    }
    if (row.date.endsWith('.07.2026')) julyRows.push({ ...row, file: f });
  }
}

const total = julyRows.reduce((s, r) => s + r.amount, 0);
console.log('July rows:', julyRows.length, 'sum:', total.toLocaleString('ru-RU'));
console.log('Duplicates found (any month):', dupCount, 'sum:', dupSum.toLocaleString('ru-RU'));
