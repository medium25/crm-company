// Правила проверки единого дизайн-кода (см. DESIGN.md). Чистые функции, без ФС.
export const HEX_ALLOWED = [
  'src/lib/chartColors.js',
  'src/lib/colors.js',
  'src/components/leads/columns.js',
];

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*|\{\/\*)/;

const RULES = [
  {
    id: 'text-px',
    re: /\btext-\[\d+(?:\.\d+)?px\]/g,
    hint: 'text-caption|small|body|control|title|page|kpi',
  },
  {
    id: 'text-default',
    re: /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl)\b/g,
    hint: 'text-caption|small|body|control|title|page|kpi',
  },
  {
    id: 'hex',
    re: /#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?\b/g,
    hint: 'токен палитры (см. DESIGN.md) или chartColors.js; данные-палитры помечать design-ok:',
  },
  {
    id: 'rgba-class',
    re: /-\[rgba?\(/g,
    hint: 'токен с /opacity, например bg-text/45',
  },
  {
    id: 'rounded',
    re: /\brounded-(?:sm|md|lg|xl|2xl|3xl)\b|(?<=[\s"'`{])rounded(?=[\s"'`}])|\brounded(?:-[trbl]{1,2})?-\[/g,
    hint: 'rounded-card|row|field|badge|full',
  },
];

/**
 * @param {string} text содержимое файла
 * @param {string} relPath путь от корня репозитория, со слэшами вперёд
 * @returns {Array<{file: string, line: number, rule: string, found: string, hint: string}>}
 */
export function checkSource(text, relPath) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (COMMENT_LINE.test(line) || line.includes('design-ok:')) return;
    for (const rule of RULES) {
      if (rule.id === 'hex' && HEX_ALLOWED.includes(relPath)) continue;
      const m = line.match(rule.re);
      if (m) out.push({ file: relPath, line: i + 1, rule: rule.id, found: m[0], hint: rule.hint });
    }
  });
  return out;
}

/** Путь считается «legacy» (ещё не переведён), если совпадает с записью или лежит внутри записи-папки. */
export function isLegacy(relPath, legacy) {
  return legacy.some((p) => relPath === p || (p.endsWith('/') && relPath.startsWith(p)));
}
