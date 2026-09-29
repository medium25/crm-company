# Единый дизайн-код (токены) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Свести внешний вид ICON CRM к одному набору токенов варианта C и закрепить его скриптом-проверкой, выкатив поэтапно пятью деплоями.

**Architecture:** Токены живут в `tailwind.config.js` (размеры текста, радиусы, тень) и `src/index.css` (цвета через CSS-переменные). Базовые компоненты `src/components/ui/*` получают проп `size` (`md` 48px / `sm` 36px) и берут только токены. Два скрипта в `scripts/`: `check-design.mjs` (падает на off-token классах, у него список LEGACY-путей, который сужается по этапам) и `migrate-design.mjs` (кодмод механической замены `text-[Npx]`/`rounded-*`). Страницы переводятся кодмодом плюс ручной доводкой по таблицам соответствия ниже.

**Tech Stack:** React 19, Vite 8, Tailwind 3.4, oxlint, `node:test` (Node 24) для тестов скриптов. Тестов для UI в проекте нет; проверка UI: `npm run lint`, `npm run build`, `npm run check:design`, визуально через dev-сервер.

Спек: `docs/superpowers/specs/2026-09-29-design-tokens-design.md`.

## Global Constraints

- Размеры текста только токены: `text-caption` 12/16, `text-small` 13/18, `text-body` 14/20, `text-control` 15/20, `text-title` 17/24, `text-page` 22/28, `text-kpi` 36/42.
- Радиусы: `rounded-card` 16px, `rounded-row` 12px, `rounded-field` 12px, `rounded-badge` 9999px; `rounded-full` только для кругов.
- Высоты контролов: `md` 48px (`h-12`, текст `control`), `sm` 36px (`h-9`, текст `small`); иконка-кнопка в строке таблицы 32px (`h-8 w-8`).
- Таблицы и канбан «Заявки» компактные (`sm`), остальное `md`.
- `Card`: фон `surface`, рамка `border`, радиус `card`, тень `shadow-soft` (`0 4px 12px rgba(16,24,40,.08)`), `p-6`. `Tile`: фон `bg`, без рамки, радиус `row`, `p-4`.
- Hex в разметке запрещён. Исключения: `src/lib/chartColors.js`, `src/lib/colors.js`, `src/components/leads/columns.js` целиком; данные-палитры в прочих файлах помечаются комментарием `design-ok: <причина>` в той же строке.
- Тёмная тема только на «Заявках»: каждый новый цветовой токен обязан иметь значение в `.dark` в `src/index.css`.
- Русский язык в UI и комментариях; общий вид, шрифт Nunito Sans и палитра не меняются.
- Деплой: `npm run deploy` (теперь с `check:design`); перед деплоем `git status` чистый (кроме untracked-файлов пользователя).
- Каждый деплой — отдельный коммит-этап; коммиты заканчиваются строкой `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Таблицы соответствия (для этапов 2–5)

**Hex → токен** (для ручной доводки после кодмода):

| Hex | Замена в классах | В SVG/Recharts |
|---|---|---|
| `#8B94A3`, `#8a8a86` | `text-muted` / `bg-muted` | `chartColors.axis` |
| `#E9EBEF`, `#E4E4E3` | `border-border` | `chartColors.grid` |
| `#D6DAE1`, `#DADAD9` | `border-border-strong` / `bg-border-strong` | `chartColors.gridStrong` |
| `#EEF0F3` | `bg-chip` | — |
| `#F0F0EF` | `bg-card-head` | — |
| `#3C4656` | `text-orange` / `bg-orange` | `chartColors.line` |
| `#4364C3`, `#3865C9`, `#1F4FBF` | `navy` (`bg-navy`, `text-navy`) | `chartColors.navy` |
| `#2F6FE4` | `text-navy-num` | `chartColors.navyNum` |
| `#E5842B`, `#E9B949` | `text-warning` / `bg-warning` | `chartColors.warning` |
| `#FDF0E3` | `bg-warning-bg` | — |
| `#E11D48`, `#C0392B`, `#BE123C` | `text-danger` / `bg-danger` | `chartColors.danger` |
| `#34A853` | `text-success` / `bg-success` | `chartColors.success` |
| `#FFFFFF` | `bg-white` / `text-white` | `chartColors.white` |

**Размеры контролов в страницах:** `h-11` на `Input/Select/Button/DatePicker` — удалить класс (по умолчанию `md`); `h-9`/`h-8` на фильтрах и тулбарах — заменить пропом `size="sm"`; `h-10` — `md`. Собственные `<input>/<select>` без компонента: `h-12 rounded-field text-control` (форма) или `h-9 rounded-field text-small` (фильтр/таблица).

**Заголовки:** кодмод превращает `text-[15px]` в `text-control`. После кодмода найти `grep -nE "font-(bold|semibold)[^\"']*text-control|text-control[^\"']*font-(bold|semibold)"` — если это заголовок блока (не текст кнопки/поля), заменить на `text-title`.

## File Structure

Создаются:
- `scripts/lib/design-rules.mjs` — правила проверки, чистая функция `checkSource(text, relPath)`.
- `scripts/check-design.mjs` — CLI: обход `src/components`, `src/pages`, список LEGACY, флаг `--strict`.
- `scripts/check-design.test.mjs` — тесты правил.
- `scripts/migrate-design.mjs` — кодмод `migrateSource(text)` + CLI.
- `scripts/migrate-design.test.mjs` — тесты кодмода.
- `src/lib/chartColors.js` — цвета Recharts/SVG.
- `src/components/ui/Tile.jsx`, `SectionTitle.jsx`, `FilterChip.jsx` — новые примитивы.
- `DESIGN.md` — правила для людей и для агентов.

Меняются: `tailwind.config.js`, `src/index.css`, `package.json`, `src/components/ui/{Button,Input,Select,DatePicker,Card,StatCard,Badge,Modal,Tabs,Table,index}.js*`, затем страницы/компоненты по этапам.

---

# ЭТАП 1. Токены, базовые компоненты, проверка

### Task 1: Токены в tailwind.config.js и index.css

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/index.css:20-72` (блоки `:root` и `.dark`)

**Interfaces:**
- Produces: классы `text-caption|small|body|control|title|page|kpi`, `shadow-soft`, `rounded-card` 16px / `rounded-row` 12px / `rounded-field` 12px / `rounded-badge` 9999px, цвета `warning`, `warning-bg`, `info`, `info-bg`, `chip`, `chart-1`…`chart-7` (+ `bg-chart-N`, `text-chart-N`).

- [ ] **Step 1: Добавить цветовые токены в `:root` и `.dark`**

В `src/index.css` в конец блока `:root` (после `--color-freeze-red: 251 234 234;`) вставить:

```css
  --color-warning: 229 132 43;
  --color-warning-bg: 253 240 227;
  --color-info: 47 111 228;
  --color-info-bg: 234 243 255;
  --color-chip: 238 240 243;
  --color-chart-1: 55 138 221;
  --color-chart-2: 29 158 117;
  --color-chart-3: 186 117 23;
  --color-chart-4: 127 119 221;
  --color-chart-5: 136 135 128;
  --color-chart-6: 212 83 126;
  --color-chart-7: 15 110 86;
```

В конец блока `.dark` (после `--color-freeze-red: 58 31 32;`) вставить:

```css
  --color-warning: 240 154 74;
  --color-warning-bg: 58 42 24;
  --color-info: 91 143 242;
  --color-info-bg: 27 42 61;
  --color-chip: 40 48 60;
  --color-chart-1: 55 138 221;
  --color-chart-2: 29 158 117;
  --color-chart-3: 186 117 23;
  --color-chart-4: 127 119 221;
  --color-chart-5: 136 135 128;
  --color-chart-6: 212 83 126;
  --color-chart-7: 15 110 86;
```

- [ ] **Step 2: Зарегистрировать цвета, размеры, радиусы, тень в `tailwind.config.js`**

В `theme.extend.colors` после блока `freeze: {...},` добавить:

```js
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          bg:      'rgb(var(--color-warning-bg) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          bg:      'rgb(var(--color-info-bg) / <alpha-value>)',
        },
        chip: 'rgb(var(--color-chip) / <alpha-value>)',
        chart: {
          1: 'rgb(var(--color-chart-1) / <alpha-value>)',
          2: 'rgb(var(--color-chart-2) / <alpha-value>)',
          3: 'rgb(var(--color-chart-3) / <alpha-value>)',
          4: 'rgb(var(--color-chart-4) / <alpha-value>)',
          5: 'rgb(var(--color-chart-5) / <alpha-value>)',
          6: 'rgb(var(--color-chart-6) / <alpha-value>)',
          7: 'rgb(var(--color-chart-7) / <alpha-value>)',
        },
```

Заменить строку `borderRadius: { card: '12px', row: '10px', field: '8px', badge: '6px' },` на:

```js
      fontSize: {
        caption: ['12px', { lineHeight: '16px' }],
        small:   ['13px', { lineHeight: '18px' }],
        body:    ['14px', { lineHeight: '20px' }],
        control: ['15px', { lineHeight: '20px' }],
        title:   ['17px', { lineHeight: '24px' }],
        page:    ['22px', { lineHeight: '28px' }],
        kpi:     ['36px', { lineHeight: '42px' }],
      },
      borderRadius: { card: '16px', row: '12px', field: '12px', badge: '9999px' },
```

В `boxShadow` добавить строку после `card:`:

```js
        soft:  '0 4px 12px rgba(16,24,40,.08)',
```

- [ ] **Step 3: Проверить сборку**

Run: `cd "/Users/donyor/Desktop/Мои проекты/СRM сlaude" && npm run build 2>&1 | tail -5`
Expected: `✓ built in …s`, без ошибок.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js src/index.css
git commit -m "feat(design): токены варианта C — размеры текста, радиусы, тень, цвета warning/info/chip/chart

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: chartColors.js

**Files:**
- Create: `src/lib/chartColors.js`

**Interfaces:**
- Produces: `chartColors` — объект строк hex: `grid`, `gridStrong`, `axis`, `line`, `lineAlt`, `lineMuted`, `white`, `navy`, `navyNum`, `warning`, `danger`, `success`, `bars` (массив из 7, значения `chart-1..7`). Используется в Recharts/SVG, где `var()` в атрибуте не работает.

- [ ] **Step 1: Создать файл**

```js
// Цвета для Recharts/SVG: атрибуты stroke/fill не принимают var(--…), поэтому hex
// живёт здесь, в одном месте. Значения совпадают с токенами в src/index.css (:root);
// на графиках тёмной темы нет. Скрипт check-design разрешает hex только тут.
export const chartColors = {
  grid: '#E9EBEF', // border
  gridStrong: '#D6DAE1', // border-strong
  axis: '#8B94A3', // muted
  line: '#3C4656', // orange (тёмный графит)
  lineAlt: '#E8695A',
  lineMuted: '#8B94A3',
  white: '#FFFFFF',
  navy: '#4364C3',
  navyNum: '#2F6FE4',
  warning: '#E5842B',
  danger: '#C0392B',
  success: '#34A853',
  // chart-1 … chart-7 из index.css
  bars: ['#378ADD', '#1D9E75', '#BA7517', '#7F77DD', '#888780', '#D4537E', '#0F6E56'],
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/chartColors.js
git commit -m "feat(design): chartColors.js — единое место для hex графиков

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 3: Button, Input, Select, DatePicker с пропом size

**Files:**
- Modify: `src/components/ui/Button.jsx` (полная замена)
- Modify: `src/components/ui/Input.jsx` (полная замена)
- Modify: `src/components/ui/Select.jsx` (полная замена)
- Modify: `src/components/ui/DatePicker.jsx` (полная замена)
- Modify: `src/pages/LoginPage.jsx:90` (`size="lg"` → убрать)
- Modify: `src/components/dev/ButtonsAndBadgesShowcase.jsx:18` (`size="lg"` → убрать)

**Interfaces:**
- Consumes: токены Task 1.
- Produces: `Button({variant, size:'md'|'sm', tone:'navy'|'danger'|'warning', loading, ...})`; `Input|Select|DatePicker({label, error, size:'md'|'sm', ...})`. `MoneyInput` без изменений: `size` уходит в `Input` через `...rest`.

- [ ] **Step 1: Button.jsx**

```jsx
const VARIANT_CLASSES = {
  primary: 'bg-navy text-white hover:bg-navy-hover',
  secondary: 'bg-white text-navy border border-navy hover:bg-orange-soft/40',
  ghost: 'bg-transparent text-muted hover:bg-surface-alt',
  danger: 'bg-white text-danger border border-danger hover:bg-danger/5',
};

const SIZE_CLASSES = {
  md: 'h-12 px-6 text-control',
  sm: 'h-9 px-4 text-small',
};

const ICON_SIZE_CLASSES = {
  md: 'h-12 w-12',
  sm: 'h-9 w-9',
};

const ICON_TONE_CLASSES = {
  navy: 'border-navy text-navy',
  danger: 'border-danger text-danger',
  warning: 'border-warning text-warning',
};

/**
 * @param {Object} props
 * @param {'primary'|'secondary'|'ghost'|'danger'|'icon-round'} [props.variant]
 * @param {'md'|'sm'} [props.size] md — 48px (формы), sm — 36px (фильтры, таблицы, канбан)
 * @param {'navy'|'danger'|'warning'} [props.tone] цвет обводки, только для variant="icon-round"
 * @param {boolean} [props.loading]
 */
export function Button({
  variant = 'primary',
  size = 'md',
  tone = 'navy',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  if (variant === 'icon-round') {
    return (
      <button
        type="button"
        disabled={disabled || loading}
        className={`inline-flex ${ICON_SIZE_CLASSES[size]} items-center justify-center rounded-full border bg-white transition-shadow hover:shadow-hover disabled:cursor-not-allowed disabled:opacity-50 ${ICON_TONE_CLASSES[tone]} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-field font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}
```

- [ ] **Step 2: Input.jsx**

```jsx
import { forwardRef } from 'react';

const SIZE_CLASSES = {
  md: 'h-12 text-control',
  sm: 'h-9 text-small',
};

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 * @param {'md'|'sm'} [props.size]
 * @param {import('react').ComponentType} [props.leftIcon] иконка из lucide-react
 */
export const Input = forwardRef(function Input(
  { label, error, size = 'md', leftIcon: LeftIcon, className = '', ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-small text-muted">{label}</span>}
      <span className="relative flex items-center">
        {LeftIcon && <LeftIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />}
        <input
          ref={ref}
          onWheel={rest.type === 'number' ? (e) => e.currentTarget.blur() : undefined}
          className={`${SIZE_CLASSES[size]} w-full rounded-field border bg-white px-3 text-text placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-navy/15 ${LeftIcon ? 'pl-9' : ''} ${
            error ? 'border-danger' : 'border-border-strong focus:border-navy'
          } ${className}`}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-small text-danger">{error}</span>}
    </label>
  );
});
```

- [ ] **Step 3: Select.jsx**

```jsx
import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const SIZE_CLASSES = {
  md: 'h-12 text-control',
  sm: 'h-9 text-small',
};

/**
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 * @param {'md'|'sm'} [props.size]
 * @param {import('react').ComponentType} [props.leftIcon]
 * @param {Array<{value: string, label: string}>} [props.options]
 */
export const Select = forwardRef(function Select(
  { label, error, size = 'md', leftIcon: LeftIcon, options, className = '', children, ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-small text-muted">{label}</span>}
      <span className="relative flex items-center">
        {LeftIcon && <LeftIcon className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />}
        <select
          ref={ref}
          className={`${SIZE_CLASSES[size]} w-full appearance-none rounded-field border bg-white px-3 pr-9 text-text focus:outline-none focus:ring-2 focus:ring-navy/15 ${LeftIcon ? 'pl-9' : ''} ${
            error ? 'border-danger' : 'border-border-strong focus:border-navy'
          } ${className}`}
          {...rest}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-muted" />
      </span>
      {error && <span className="mt-1 block text-small text-danger">{error}</span>}
    </label>
  );
});
```

- [ ] **Step 4: DatePicker.jsx**

```jsx
import { forwardRef } from 'react';
import { Calendar } from 'lucide-react';

const SIZE_CLASSES = {
  md: 'h-12 text-control',
  sm: 'h-9 text-small',
};

/**
 * Обёртка над нативным input[type=date] — своя библиотека дат не подключается
 * (единственная разрешённая — date-fns, только для форматирования).
 * @param {Object} props
 * @param {string} [props.label]
 * @param {string} [props.error]
 * @param {'md'|'sm'} [props.size]
 */
export const DatePicker = forwardRef(function DatePicker(
  { label, error, size = 'md', className = '', ...rest },
  ref,
) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-small text-muted">{label}</span>}
      <span className="relative flex items-center">
        <Calendar className="pointer-events-none absolute left-3 h-4 w-4 text-muted" />
        <input
          ref={ref}
          type="date"
          onClick={(e) => e.currentTarget.showPicker?.()}
          onFocus={(e) => e.currentTarget.showPicker?.()}
          className={`date-input ${SIZE_CLASSES[size]} w-full rounded-field border bg-white pl-10 pr-3 text-text focus:outline-none focus:ring-2 focus:ring-navy/15 disabled:cursor-not-allowed disabled:bg-surface-alt disabled:text-muted ${
            error ? 'border-danger' : 'border-border-strong focus:border-navy'
          } ${className}`}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-small text-danger">{error}</span>}
    </label>
  );
});
```

- [ ] **Step 5: Убрать `size="lg"`**

В `src/pages/LoginPage.jsx:90`: `<Button type="submit" size="lg" loading={submitting} className="w-full">` → `<Button type="submit" loading={submitting} className="w-full">`.
В `src/components/dev/ButtonsAndBadgesShowcase.jsx:18`: `<Button variant="primary" size="lg">` → `<Button variant="primary" size="sm">` (показать оба размера: рядом соседний Button оставить `md`, если есть; если нет — просто убрать `size`).

- [ ] **Step 6: Проверка**

Run: `npm run lint 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: lint без новых ошибок, `✓ built`.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui src/pages/LoginPage.jsx src/components/dev/ButtonsAndBadgesShowcase.jsx
git commit -m "feat(design): Button/Input/Select/DatePicker — размеры md 48px / sm 36px, радиус field

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 4: Card, StatCard, Badge, Modal, Tabs, Table на токены

**Files:**
- Modify: `src/components/ui/Card.jsx`, `StatCard.jsx`, `Badge.jsx`, `Modal.jsx`, `Tabs.jsx`, `Table.jsx`

**Interfaces:**
- Consumes: токены Task 1.
- Produces: `Card` белая с мягкой тенью; `StatCard` — карточка-плитка; `Badge` пилюля из токенов; таблица на `text-small` с компактными строками.

- [ ] **Step 1: Card.jsx** — заменить className:

```jsx
/**
 * Белая карточка: фон surface, светлая рамка, радиус card (16px), мягкая тень.
 * @param {Object} props
 * @param {boolean} [props.hoverable] добавляет тень hover при наведении
 */
export function Card({ hoverable = false, className = '', children, ...rest }) {
  return (
    <div
      className={`rounded-card border border-border bg-surface p-6 shadow-soft ${hoverable ? 'transition-shadow hover:shadow-hover' : ''} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: StatCard.jsx** — в `className` кнопки/div заменить `rounded-card border border-border-strong bg-card p-6 text-center shadow-card` на `rounded-card border border-border bg-surface p-6 text-center shadow-soft`; подпись `text-[13px] leading-[18px]` → `text-body`; число `text-[34px] leading-[40px]` → `text-kpi`. Итоговые фрагменты:

```jsx
      className={`flex w-full flex-col items-center rounded-card border border-border bg-surface p-6 text-center shadow-soft transition-shadow ${
        onClick ? 'cursor-pointer hover:shadow-hover' : ''
      }`}
...
      <span className="mb-1 flex h-9 items-center text-body text-muted">{label}</span>
      <span className="text-kpi text-navy-num">{value}</span>
```

- [ ] **Step 3: Badge.jsx** — заменить `VARIANT_CLASSES` hex и форму:

```jsx
const VARIANT_CLASSES = {
  'status-active': 'bg-success-bg text-success',
  'status-debt': 'bg-danger-bg text-white',
  'type-system': 'bg-chip text-muted',
  'type-payment': 'bg-success text-white',
  'group-code': 'bg-chip text-text tabular-nums',
  'attendance-present': 'bg-present text-white',
  'attendance-absent': 'bg-absent text-white',
  'attendance-present-muted': 'bg-muted text-white',
  'attendance-absent-muted': 'bg-border-strong text-muted',
};

/**
 * @param {Object} props
 * @param {keyof typeof VARIANT_CLASSES} props.variant
 */
export function Badge({ variant, className = '', children }) {
  return (
    <span
      className={`inline-flex items-center rounded-badge px-2.5 py-0.5 text-caption font-bold ${VARIANT_CLASSES[variant] ?? ''} ${className}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Modal.jsx** — три замены:
  - `bg-[rgba(16,24,40,.45)]` → `bg-text/45`;
  - `rounded-2xl` → `rounded-card`;
  - `text-xl font-bold text-text` → `text-title font-bold text-text`.

- [ ] **Step 5: Tabs.jsx** — `text-[15px]` → `text-control`.

- [ ] **Step 6: Table.jsx** — заголовок и ячейки на `text-small`, строки компактнее:
  - шапка: `px-5 py-2 text-left text-[15px] font-bold` → `px-4 py-2 text-left text-small font-bold`;
  - строка: `rounded-row px-5 py-4 shadow-card` → `rounded-row px-4 py-3 shadow-card`;
  - ячейка: `min-w-0 px-0 text-[15px] text-text` → `min-w-0 px-0 text-small text-text`.

  Если после деплоя этапа 1 таблицы окажутся слишком мелкими, менять на `text-body` в этих двух местах (единственная точка правки).

- [ ] **Step 7: Проверка**

Run: `npm run lint 2>&1 | tail -5 && npm run build 2>&1 | tail -3`
Expected: без ошибок.

- [ ] **Step 8: Commit**

```bash
git add src/components/ui
git commit -m "feat(design): Card/StatCard/Badge/Modal/Tabs/Table на токены варианта C

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 5: Примитивы Tile, SectionTitle, FilterChip

**Files:**
- Create: `src/components/ui/Tile.jsx`, `SectionTitle.jsx`, `FilterChip.jsx`
- Modify: `src/components/ui/index.js` (добавить экспорты)

**Interfaces:**
- Produces: `Tile({className, children, ...rest})`; `SectionTitle({title, hint?, className?})`; `FilterChip({active, onClick, className?, children})`.

- [ ] **Step 1: Tile.jsx**

```jsx
/**
 * Вложенная плитка внутри Card: фон страницы, без рамки, радиус row.
 * Прямо на фоне страницы не ставить (сольётся), там нужен Card/StatCard.
 */
export function Tile({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-row bg-bg p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: SectionTitle.jsx**

```jsx
/**
 * Заголовок блока (title) с приглушённой подписью рядом.
 * @param {Object} props
 * @param {string} props.title
 * @param {string} [props.hint] «· 40 оплат», «за сентябрь»
 * @param {string} [props.className]
 */
export function SectionTitle({ title, hint, className = 'mb-3' }) {
  return (
    <p className={`text-title font-bold text-text ${className}`}>
      {title}
      {hint && <span className="ml-2 text-small font-normal text-muted">{hint}</span>}
    </p>
  );
}
```

- [ ] **Step 3: FilterChip.jsx**

```jsx
/**
 * Кнопка-чип фильтра (36px). Активная — navy.
 * @param {Object} props
 * @param {boolean} [props.active]
 * @param {() => void} [props.onClick]
 */
export function FilterChip({ active = false, onClick, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-9 items-center gap-1.5 rounded-badge border px-4 text-small font-semibold transition-colors ${
        active
          ? 'border-navy bg-navy text-white'
          : 'border-border-strong bg-surface text-text hover:bg-surface-alt'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Экспорты** — в `src/components/ui/index.js` добавить в конец:

```js
export { Tile } from './Tile.jsx';
export { SectionTitle } from './SectionTitle.jsx';
export { FilterChip } from './FilterChip.jsx';
```

- [ ] **Step 5: Проверка и коммит**

Run: `npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: без ошибок.

```bash
git add src/components/ui
git commit -m "feat(design): примитивы Tile, SectionTitle, FilterChip

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 6: Скрипт check-design (TDD)

**Files:**
- Create: `scripts/lib/design-rules.mjs`
- Create: `scripts/check-design.mjs`
- Test: `scripts/check-design.test.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `checkSource(text: string, relPath: string) => Array<{file, line, rule, found, hint}>`; `isLegacy(relPath: string, legacy: string[]) => boolean`; CLI `node scripts/check-design.mjs [--strict]` (exit 1 при нарушениях; `--strict` игнорирует LEGACY). Правила: `text-px`, `text-default`, `hex`, `rgba-class`, `rounded`. Строки-комментарии и строки с `design-ok:` пропускаются; `hex` не проверяется в файлах из `HEX_ALLOWED`.

- [ ] **Step 1: Написать падающие тесты** `scripts/check-design.test.mjs`

```js
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
```

- [ ] **Step 2: Запустить, убедиться что падают**

Run: `node --test scripts/check-design.test.mjs 2>&1 | tail -8`
Expected: FAIL, `Cannot find module './lib/design-rules.mjs'`.

- [ ] **Step 3: Реализовать `scripts/lib/design-rules.mjs`**

```js
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
```

- [ ] **Step 4: Запустить тесты**

Run: `node --test scripts/check-design.test.mjs 2>&1 | tail -8`
Expected: `# pass 10`, `# fail 0`.

- [ ] **Step 5: CLI `scripts/check-design.mjs`**

Список `LEGACY` на этапе 1 — всё, кроме `src/components/ui/`:

```js
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
```

Внимание: файлы `src/components/ui/*` уже переведены в Tasks 3–5, но `Modal.jsx`/`Table.jsx` и др. могли остаться с нарушением, тогда шаг 6 их покажет.

- [ ] **Step 6: Запустить на текущем коде**

Run: `node scripts/check-design.mjs; echo "exit=$?"`
Expected: `check-design: ок`, `exit=0`, строка `(пропущено legacy-файлов: N)`. Если есть нарушения в `src/components/ui/`, исправить их (это недоделка Tasks 3–5), затем повторить.

Run: `node scripts/check-design.mjs --strict | tail -3`
Expected: `check-design: нарушений <число>` (сотни), `exit 1`.

- [ ] **Step 7: package.json** — в `"scripts"` заменить `deploy` и добавить два скрипта:

```json
    "check:design": "node scripts/check-design.mjs",
    "test:design": "node --test scripts/check-design.test.mjs scripts/migrate-design.test.mjs",
    "deploy": "npm run check:design && npm run build && gh-pages -d dist",
```

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/design-rules.mjs scripts/check-design.mjs scripts/check-design.test.mjs package.json
git commit -m "feat(design): check-design — проверка off-token классов, LEGACY-список, деплой блокируется

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 7: Кодмод migrate-design (TDD)

**Files:**
- Create: `scripts/migrate-design.mjs`
- Test: `scripts/migrate-design.test.mjs`

**Interfaces:**
- Produces: `migrateSource(text: string) => string` (построчно, комментарии не трогает); CLI `node scripts/migrate-design.mjs <file…>` переписывает файлы, печатает изменённые. Замены: `text-[9|10|11|12px]`→`text-caption`, `13`→`small`, `14`→`body`, `15`→`control`, `17`→`title`, `20|22`→`page`, `28|32|34`→`kpi`; `text-xs`→`text-caption`, `text-xl`→`text-title`; `rounded-2xl`→`rounded-card`, `rounded-xl`→`rounded-row`, `rounded-lg|md`→`rounded-field`, `rounded-sm` и голый `rounded`→`rounded-badge`. Не трогает `h-*`, hex, `rounded-[…]`.

- [ ] **Step 1: Тесты** `scripts/migrate-design.test.mjs`

```js
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
```

- [ ] **Step 2: Убедиться, что падают**

Run: `node --test scripts/migrate-design.test.mjs 2>&1 | tail -6`
Expected: FAIL, `Cannot find module './migrate-design.mjs'`.

- [ ] **Step 3: Реализация `scripts/migrate-design.mjs`**

```js
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
```

- [ ] **Step 4: Тесты**

Run: `npm run test:design 2>&1 | tail -8`
Expected: `# pass 16`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-design.mjs scripts/migrate-design.test.mjs
git commit -m "feat(design): кодмод migrate-design — text-[Npx] и rounded-* на токены

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 8: DESIGN.md, проверка этапа 1, деплой

**Files:**
- Create: `DESIGN.md`

- [ ] **Step 1: DESIGN.md**

```markdown
# Дизайн-код ICON CRM

Один набор токенов на всё приложение. Значения живут в `tailwind.config.js` и `src/index.css`. Спек: `docs/superpowers/specs/2026-09-29-design-tokens-design.md`.

## Правила

1. Только токены. Никаких `text-[13px]`, `#hex`, `bg-[rgba(...)]`, `rounded-xl` в разметке. Проверяет `npm run check:design`, деплой без него не идёт.
2. Высоту и радиус контролов задаёт компонент: `Button/Input/Select/DatePicker` с `size="md"` (48px, формы и модалки) или `size="sm"` (36px, фильтры, таблицы, канбан).
3. Таблицы и канбан «Заявки» компактные (`sm`); карточки, формы, модалки обычные (`md`).
4. Исключение для данных (цвета оператора, палитры, приоритеты): строка с комментарием `design-ok: причина`. Цвета графиков — в `src/lib/chartColors.js`.

## Токены

| Что | Значения |
|---|---|
| Текст | `caption` 12, `small` 13 (таблицы, подписи), `body` 14, `control` 15 (кнопки, поля), `title` 17 (заголовки блоков), `page` 22, `kpi` 36 |
| Радиусы | `card` 16 (карточки, модалки), `row` 12 (плитки, строки), `field` 12 (кнопки, поля), `badge` пилюля; круг — `rounded-full` |
| Тени | `shadow-soft` (карточки), `shadow-card` (строки таблиц), `shadow-hover`, `shadow-modal` |
| Цвета | `bg surface card card-head surface-alt border border-strong text muted navy orange success danger warning info chip chart-1..7` |

## Что использовать вместо чего

| Было | Стало |
|---|---|
| `text-[13px]` | `text-small` |
| `text-[15px]` в заголовке блока | `text-title` |
| `text-[15px]` в кнопке/поле | `text-control` (даёт сам компонент) |
| `text-[34px]` | `text-kpi` |
| `rounded-xl` / `rounded-2xl` | `rounded-row` / `rounded-card` |
| `h-11` на поле | без класса (по умолчанию `md`), фильтр: `size="sm"` |
| `bg-[#EEF0F3]` | `bg-chip` |
| `#E5842B` | `text-warning` |

## Компоненты

`Card` (белая, тень), `Tile` (плитка внутри Card, фон страницы), `StatCard` (KPI-карточка), `SectionTitle` (заголовок блока + подпись), `FilterChip` (чип фильтра), `Badge` (пилюля), `Button`, `Input`, `Select`, `DatePicker`, `Modal`, `Tabs`, `Table`.
```

- [ ] **Step 2: Полная проверка**

Run: `npm run test:design 2>&1 | tail -4 && npm run check:design | tail -2 && npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: тесты pass, `check-design: ок`, lint без новых ошибок, `✓ built`.

- [ ] **Step 3: Визуальная проверка**

Запустить dev-сервер `preview_start {name: "icon-crm-dev"}` (в `.env` есть `VITE_DEV_BYPASS_AUTH`, вход не нужен; если страницы просят вход — `SEED_ADMIN_EMAIL/PASSWORD` из `.env`, это тестовые значения локального приложения). Открыть `#/settings/ui` (UiKitShowcasePage) и проверить: кнопки 48/36px и радиус 12, поля 48px, бейджи пилюлями, карточка белая с тенью, модалка с радиусом 16 и заголовком 17px. Открыть `#/students` и `#/payments`: таблица читаема при 13px (если нет — `text-body` в двух местах `Table.jsx`, Task 4 Step 6), кнопки не «ломают» строки. Планшетная ширина: `resize_window preset tablet`. Скриншот каждого экрана. Чтения Firestore в этих проверках метрятся: не листать много страниц.

- [ ] **Step 4: Коммит и деплой этапа 1**

```bash
git add DESIGN.md
git commit -m "docs(design): DESIGN.md — токены, правила, таблица «было/стало»

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git status --short   # только untracked-файлы пользователя
git push origin main
npm run deploy
```
Expected: `check-design: ок`, build, `Published`.

---

# ЭТАП 2. Дашборд и Платежи

### Task 9: Дашборд, Платежи, графики, анализ источников

**Files (Modify):** `src/pages/DashboardPage.jsx`, `src/pages/PaymentsPage.jsx`, `src/components/charts/{RevenueChart,RevenueOverviewChart,MonthComparisonChart,TrialsMonthChart}.jsx`, `src/components/payments/PaymentSourceAnalysis.jsx`, `src/components/dashboard/RoomScheduleGrid.jsx`, `src/components/billing/BillingBanner.jsx`, `scripts/check-design.mjs` (LEGACY)

- [ ] **Step 1: Сузить LEGACY** — в `scripts/check-design.mjs` удалить из `LEGACY` записи `'src/components/billing/'`, `'src/components/charts/'`, `'src/components/dashboard/'`, `'src/components/payments/'`. Запись `'src/pages/'` заменить на явный список всех страниц, кроме этапа: `'src/pages/CoursesPage.jsx'`, `'src/pages/GroupDetailPage.jsx'`, `'src/pages/GroupsPage.jsx'`, `'src/pages/LeadsPage.jsx'`, `'src/pages/LoginPage.jsx'`, `'src/pages/ReportsLandingPage.jsx'`, `'src/pages/ReportsPage.jsx'`, `'src/pages/RoomsPage.jsx'`, `'src/pages/SalesStatsPage.jsx'`, `'src/pages/SettingsPage.jsx'`, `'src/pages/StatsDepartmentsPage.jsx'`, `'src/pages/StudentDetailPage.jsx'`, `'src/pages/StudentsPage.jsx'`, `'src/pages/TasksPage.jsx'`, `'src/pages/TeacherDetailPage.jsx'`, `'src/pages/TeachersAndGroupsPage.jsx'`, `'src/pages/TeachersPage.jsx'`, `'src/pages/TrialsPage.jsx'`, `'src/pages/UiKitShowcasePage.jsx'` (то есть исключены `DashboardPage.jsx` и `PaymentsPage.jsx`).

- [ ] **Step 2: Кодмод**

Run: `node scripts/migrate-design.mjs src/pages/DashboardPage.jsx src/pages/PaymentsPage.jsx src/components/charts/*.jsx src/components/payments/PaymentSourceAnalysis.jsx src/components/dashboard/RoomScheduleGrid.jsx src/components/billing/BillingBanner.jsx`

- [ ] **Step 3: Список остатка**

Run: `npm run check:design`
Expected: список оставшихся нарушений (hex, `h-*`, `rounded-[…]`, необработанные размеры).

- [ ] **Step 4: Доводка вручную**
  - Графики: заменить hex по таблице «Hex → токен» на `chartColors.*` (`import { chartColors } from '../../lib/chartColors.js';`), например `<CartesianGrid stroke={chartColors.grid} />`, `tick={{ fontSize: 12, fill: chartColors.axis }}`, `stroke={chartColors.line}`; `#E8695A` → `chartColors.lineAlt`, `#FFFFFF` → `chartColors.white`.
  - `PaymentSourceAnalysis.jsx`: удалить `BAR_COLORS`; цвет полосы `style={{ width: …, backgroundColor: \`rgb(var(--color-chart-${(i % 7) + 1}))\` }}`; шапку блока (`<p className="mb-3 text-control font-bold …">` с подписью) заменить на `<SectionTitle title="Анализ источников оплат" hint={…} />`; вложенные плитки/панель «i» — `Tile`.
  - `DashboardPage.jsx`: плитки с `rounded-xl` → `Tile` или `rounded-row` по смыслу (внутри `Card` — `Tile`); заголовки блоков `text-control font-bold` → `text-title` (см. правило «Заголовки»).
  - `PaymentsPage.jsx`: `h-*` на фильтрах → `size="sm"`, карточки методов оплаты — `Card`/`Tile`.
  - Повторять Step 3, пока `npm run check:design` не даст `ок`.

- [ ] **Step 5: Проверка**

Run: `npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Визуально (dev-сервер): `#/dashboard` — плитки, график выручки, «Анализ источников оплат» (строка «Прошлый месяц» с кнопкой «i»), график пробных в панели деталей; `#/payments` — «По методам оплаты», таблица платежей, фильтры; тёмная тема не затронута. Планшетная ширина 768px. Скриншоты.

- [ ] **Step 6: Commit и деплой**

```bash
git add -A src scripts
git commit -m "feat(design): этап 2 — дашборд, платежи, графики на токены

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main && npm run deploy
```

---

# ЭТАП 3. Студенты, Группы, Посещаемость, Учителя

### Task 10: Студенты, Группы, Посещаемость, Учителя

**Files (Modify):** `src/pages/{StudentsPage,StudentDetailPage,GroupsPage,GroupDetailPage,TeachersPage,TeacherDetailPage,TeachersAndGroupsPage,CoursesPage,RoomsPage,StatsDepartmentsPage}.jsx`; `src/components/students/*.jsx` (все, кроме `DeclineLeadModal.jsx`, `TaskListModal.jsx` — они относятся к заявкам, этап 4); `src/components/groups/*.jsx`; `src/components/teachers/*.jsx`; `src/components/shared/*.jsx`; `scripts/check-design.mjs`

- [ ] **Step 1: Сузить LEGACY** — убрать из `LEGACY` перечисленные страницы и папки `'src/components/groups/'`, `'src/components/teachers/'`, `'src/components/shared/'`; вместо `'src/components/students/'` оставить два файла: `'src/components/students/DeclineLeadModal.jsx'`, `'src/components/students/TaskListModal.jsx'`.

- [ ] **Step 2: Кодмод**

Run:
```bash
node scripts/migrate-design.mjs src/pages/StudentsPage.jsx src/pages/StudentDetailPage.jsx src/pages/GroupsPage.jsx src/pages/GroupDetailPage.jsx src/pages/TeachersPage.jsx src/pages/TeacherDetailPage.jsx src/pages/TeachersAndGroupsPage.jsx src/pages/CoursesPage.jsx src/pages/RoomsPage.jsx src/pages/StatsDepartmentsPage.jsx src/components/groups/*.jsx src/components/teachers/*.jsx src/components/shared/*.jsx
for f in src/components/students/*.jsx; do case "$f" in *DeclineLeadModal*|*TaskListModal*) ;; *) node scripts/migrate-design.mjs "$f";; esac; done
```

- [ ] **Step 3: Остаток** — `npm run check:design`.

- [ ] **Step 4: Доводка вручную** по правилам «Hex → токен», «Размеры контролов в страницах», «Заголовки». Особенности:
  - `StudentsPage.jsx`, `StudentDetailPage.jsx`: `bg-[#EEF0F3]` → `bg-chip`; своих `<input>/<select>` в фильтрах — `h-9 rounded-field text-small`; чипы фильтров — `FilterChip`.
  - `GroupDetailPage.jsx:71`: `bg-[#EEF0F3]` → `bg-chip`.
  - `AllStudentsSummary.jsx`: массив `CATEGORICAL` — данные-палитра: добавить в конце строки `// design-ok: категориальная палитра диаграммы`; `stroke="#FFFFFF"` → `chartColors.white`.
  - `AttendanceTab.jsx`, `AttendanceByTeacher.jsx`: ячейки посещаемости остаются компактными, размер не увеличивать.
  - Модалки: поля без `h-*`, кнопки в футере без `size` (md).
  - Повторять Step 3 до `ок`.

- [ ] **Step 5: Проверка**

Run: `npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Визуально: `#/students` (таблица, фильтры, «Должники по учителям»), карточка студента (вкладки, платёж-модалка, перевод в группу), `#/groups`, карточка группы (посещаемость, оценки, экзамены), `#/teachers`. Модалки с длинными формами: проверить прокрутку на 768px. Скриншоты.

- [ ] **Step 6: Commit и деплой**

```bash
git add -A src scripts
git commit -m "feat(design): этап 3 — студенты, группы, посещаемость, учителя на токены

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main && npm run deploy
```

---

# ЭТАП 4. Заявки, Задачи, Пробные, Покинувшие

### Task 11: Заявки, Задачи, Пробные

**Files (Modify):** `src/pages/{LeadsPage,TasksPage,TrialsPage,SalesStatsPage}.jsx`; `src/components/leads/*.jsx` (`columns.js` не трогать: в whitelist); `src/components/students/{DeclineLeadModal,TaskListModal}.jsx`; `scripts/check-design.mjs`

- [ ] **Step 1: Сузить LEGACY** — убрать `'src/pages/LeadsPage.jsx'`, `TasksPage.jsx`, `TrialsPage.jsx`, `SalesStatsPage.jsx`, `'src/components/leads/'`, оба файла `students/`.

- [ ] **Step 2: Кодмод**

Run: `node scripts/migrate-design.mjs src/pages/LeadsPage.jsx src/pages/TasksPage.jsx src/pages/TrialsPage.jsx src/pages/SalesStatsPage.jsx src/components/leads/*.jsx src/components/students/DeclineLeadModal.jsx src/components/students/TaskListModal.jsx`

- [ ] **Step 3: Остаток** — `npm run check:design`.

- [ ] **Step 4: Доводка вручную.** Осторожно: канбан остаётся компактным, размер карточек лидов не увеличивать (`LeadCard`, `TrialCompletedCard` имеют фиксированную высоту `h-[237px]`, менять только радиус/цвет/шрифт по токенам).
  - `LeadColumn.jsx` `TONE_DANGER` (`bg-[rgba(190,18,60,0.13)] text-[#BE123C] dark:bg-[rgba(253,164,175,0.15)] …`) → `bg-danger/15 text-danger`; аналогично `LeadCard.jsx:614`, `LeadCard.jsx:211` (`bg-[#A34E64] hover:bg-[#8F4356]` → `bg-danger hover:bg-danger-bg`), `text-[#E5842B]` → `text-warning`.
  - Цвета оператора/этапа с `|| '#8B94A3'` (LeadCard:853, TrialCompletedCard:36,149) — данные: добавить `// design-ok: цвет из данных оператора/этапа` в той же строке либо заменить фолбэк на `chartColors.axis` (импорт из `lib/chartColors.js`).
  - `TasksPage.jsx`: серые фоны `#F0F0EF`→`bg-card-head`, `#DADAD9`→`bg-border-strong`, `#8a8a86`→`text-muted`, синие `#3865C9/#1F4FBF/#4364C3`→`navy`; SVG-атрибуты (`stroke`, `fill`) и `BLUE_STEPS`, `EMPTY_SQUARE` — в `chartColors` (добавить ключи `taskBlueSteps`, `taskEmpty`, `taskLine`) или `design-ok`; приоритеты и `accent` секций (`#C0392B/#E5842B/#D4A017/#7C5CBF/#E11D48/#2F6FE4/#34A853`) — данные, строки с `design-ok: цвет приоритета/секции`. `rounded-[13px]`, `p-[13px]` → `rounded-card p-4`.
  - `SalesStatsPage.jsx`: `warn: 'bg-[#FDF0E3] text-[#E5842B]'` → `bg-warning-bg text-warning`; `GRADE_HEX`, `AVATAR_PALETTE` → `design-ok`.
  - Повторять Step 3 до `ок`.

- [ ] **Step 5: Проверка (осторожнее всего тут)**

Run: `npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Визуально: `#/leads` — колонки, карточки (высота и текст не «поехали»), переключатель тёмной темы (все блоки читаемы, нет светлых пятен), модалки «Дедлайн», «Пробный», «Запись в группу»; `#/tasks` — три секции, график, «Просроченные»; `#/trials`. Планшет 768px: кнопки ✓/✗ на карточке лида нажимаются (не меньше 36px). Скриншоты в светлой и тёмной теме.

- [ ] **Step 6: Commit и деплой**

```bash
git add -A src scripts
git commit -m "feat(design): этап 4 — заявки, задачи, пробные, канбан на токены

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main && npm run deploy
```

---

# ЭТАП 5. Настройки, остатки, обязательная проверка

### Task 12: Остатки и снятие LEGACY

**Files (Modify):** `src/pages/{SettingsPage,LoginPage,ReportsPage,ReportsLandingPage,UiKitShowcasePage}.jsx`; `src/components/settings/*.jsx`; `src/components/layout/*.jsx`; `src/components/dev/*.jsx`; `scripts/check-design.mjs`; `DESIGN.md`

- [ ] **Step 1: Очистить LEGACY** — в `scripts/check-design.mjs` сделать `const LEGACY = [];`.

- [ ] **Step 2: Кодмод по всему остатку**

Run: `node scripts/migrate-design.mjs src/pages/SettingsPage.jsx src/pages/LoginPage.jsx src/pages/ReportsPage.jsx src/pages/ReportsLandingPage.jsx src/pages/UiKitShowcasePage.jsx src/components/settings/*.jsx src/components/layout/*.jsx src/components/dev/*.jsx`

- [ ] **Step 3: Остаток** — `npm run check:design`.

- [ ] **Step 4: Доводка вручную** по таблицам плана. Особенности:
  - `FirebaseUsageTab.jsx`: `toneOf` (`#E11D48/#E5842B/#4364C3`) и `Bar color` — цвета SVG/inline-style: взять из `chartColors` (`danger/warning/navy`); `rounded-t-[3px]` → `rounded-t-badge`.
  - `Sidebar.jsx`, `Topbar.jsx`, `GlobalSearch.jsx`: `kbd` и мелкие подписи — `text-caption`; высота поиска — `size="sm"`.
  - `dev/*Showcase.jsx`: показывать оба размера контролов (`md` и `sm`), Badge-пилюли, `Tile`, `SectionTitle`, `FilterChip`.
  - Повторять Step 3 до `ок` (без LEGACY).

- [ ] **Step 5: Строгая проверка и полный прогон**

Run: `npm run check:design && npm run test:design 2>&1 | tail -4 && npm run lint 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: `check-design: ок`, тесты pass, `✓ built`. `node scripts/check-design.mjs --strict` даёт то же самое.

- [ ] **Step 6: Визуальный обход** — `#/settings` (все вкладки: сотрудники, направления, расход Firebase, шаблоны SMS), логин (`#/login`), `#/settings/ui` (витрина), сайдбар и топбар, поиск. Планшет 768px. Скриншоты.

- [ ] **Step 7: DESIGN.md** — дописать в конец раздел:

```markdown
## Проверка

`npm run check:design` — без исключений (список LEGACY пуст). Новый файл с `text-[Npx]`, hex или `rounded-xl` не пройдёт деплой. Нужен цвет-данные — строка с `design-ok: причина`.
```

- [ ] **Step 8: Commit и финальный деплой**

```bash
git add -A src scripts DESIGN.md
git commit -m "feat(design): этап 5 — настройки, лэйаут, витрина; LEGACY пуст, проверка обязательна

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push origin main && npm run deploy
```

---

## Self-Review (сверка со спеком)

- Токены (размеры, радиусы, высоты, карточки, цвета): Tasks 1, 3, 4, 5.
- `Tile`, `SectionTitle`, `FilterChip`: Task 5; использование в страницах: Tasks 9–12.
- `chartColors.js` и whitelist hex: Tasks 2, 6, 9, 11, 12.
- `DESIGN.md`: Task 8, дополняется в Task 12.
- `check-design` с `design-ok`, LEGACY, деплой-гейт: Task 6, сужение в Tasks 9–12.
- Этапы 1–5: раздел ЭТАП 1…5.
- Проверка (lint/build/визуально/планшет/тёмная тема «Заявок»): Steps проверки в Tasks 8–12.
- Иконки-кнопки в строках таблиц 32px: правило в Global Constraints, применяется при доводке этапов 3–5 (`h-8 w-8` допустим, проверка `h-*` не автоматизирована).
- Типы: `size: 'md'|'sm'`, `chartColors.*`, `checkSource`, `isLegacy`, `migrateSource` названы одинаково во всех задачах.

Известные ограничения: автопроверки высот (`h-11` и т.п.) нет — только вручную по таблице; `Table` на `text-small` — пробное решение с быстрым откатом на `text-body` (Task 4 Step 6).
