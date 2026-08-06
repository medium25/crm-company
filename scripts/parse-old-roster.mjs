import { readFileSync } from 'fs';

const raw = readFileSync('/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/be1ba6fd-58d1-4187-8d55-6ab9cb97ff58/scratchpad/old_roster_raw.txt', 'utf8');
const lines = raw.split('\n').map((l) => l.trim());

const records = [];
let i = 0;
while (i < lines.length) {
  if (/^\d+\.$/.test(lines[i])) {
    const name = lines[i + 1];
    const phoneRaw = lines[i + 2];
    const balanceRaw = lines[i + 3];
    const phoneDigits = (phoneRaw || '').replace(/\D/g, '');
    const phone = phoneDigits.length === 9 ? '998' + phoneDigits : phoneDigits;
    const balance = parseInt((balanceRaw || '0').replace(/[^\d-]/g, ''), 10);
    records.push({ name, phone, balance });
    i += 4;
    while (i < lines.length && lines[i] === '') i++;
  } else {
    i++;
  }
}

console.log(`Распарсено записей: ${records.length}`);
import { writeFileSync } from 'fs';
writeFileSync('/private/tmp/claude-501/-Users-donyor-Desktop--------------RM--laude/be1ba6fd-58d1-4187-8d55-6ab9cb97ff58/scratchpad/old_roster.json', JSON.stringify(records, null, 2));
