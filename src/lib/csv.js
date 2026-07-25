/**
 * Экспорт/импорт CSV — замена XLSX без новых зависимостей (раздел 00
 * запрещает добавлять зависимости без явного разрешения). CSV открывается
 * в Excel/Google Sheets так же, как XLSX, для списков это равноценно.
 */

function escapeCsvField(value) {
  const s = value == null ? '' : String(value);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {Array<{key: string, label: string, value: (row: Object) => any}>} columns
 * @param {Array<Object>} rows
 * @returns {string}
 */
export function toCsv(columns, rows) {
  const header = columns.map((c) => escapeCsvField(c.label)).join(',');
  const lines = rows.map((row) => columns.map((c) => escapeCsvField(c.value(row))).join(','));
  return [header, ...lines].join('\r\n');
}

/**
 * Скачивает CSV файл в браузере. BOM в начале — чтобы Excel на Windows
 * правильно распознал UTF-8 (иначе кириллица превращается в кракозябры).
 * @param {string} filename
 * @param {string} content
 */
export function downloadCsv(filename, content) {
  const blob = new Blob([`﻿${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Простой RFC4180-парсер: кавычки, экранированные кавычки внутри поля,
 * запятая-разделитель, \r\n и \n как конец строки.
 * @param {string} text
 * @returns {Array<Object>} первая строка — заголовки, дальше — объекты
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // пропускаем, конец строки обрабатывает \n
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, i) => {
        obj[h] = (r[i] ?? '').trim();
      });
      return obj;
    });
}
