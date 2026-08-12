# Leads Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-grid «Заявки» page with one 6-column kanban board — native HTML5 drag-and-drop between columns, a tap-based move menu for touch, operator-colored avatars, and a slimmer per-card action menu.

**Architecture:** `LeadsPage.jsx` becomes a thin orchestrator (query leads + staff, group by column, wire callbacks) over two new presentational components (`LeadColumn`, `LeadCard`) under a new `src/components/leads/` folder, plus a shared `columns.js` module defining the 6 columns and which Firestore fields each one maps to. A `staff.color` field (new) drives the avatar color; the picker reuses the same hex `PALETTE` the courses page already uses, now extracted to `src/lib/colors.js` so both pages share it.

**Tech Stack:** React 19, Firestore (`firebase` JS SDK v12), Tailwind, `lucide-react` icons. No new dependencies — drag-and-drop is native HTML5 (`draggable`, `onDragStart`/`onDragOver`/`onDrop`), not a library.

## Global Constraints

- No test runner exists in this project (`package.json` has no test script, no `*.test.*` files anywhere). Verification for every task is: `npm run build` (must succeed), `npm run lint` (must show no new warnings beyond the pre-existing ones), and a manual check in the live browser preview (dev server `icon-crm-dev`, `http://localhost:5173`, already wired to a real Firebase project this session — not the `VITE_DEV_BYPASS_AUTH` mock some older docs describe).
- Don't add npm dependencies without asking (project-wide rule, see `docs/PROGRESS.md`).
- Follow existing code style: no comments except where they explain non-obvious *why* (this codebase's existing files are full of exactly that kind of comment — match the tone, don't over- or under-comment).
- Every Firestore write goes through `updateDoc`/`setDoc` with `updatedAt: serverTimestamp()` — match existing call sites, don't invent a different pattern.
- Source spec: `docs/superpowers/specs/2026-08-12-leads-kanban-design.md` — re-read it if a task here seems to contradict it.

---

### Task 1: Shared color palette

**Files:**
- Create: `src/lib/colors.js`
- Modify: `src/pages/CoursesPage.jsx:1-17`

**Interfaces:**
- Produces: `PALETTE` (exported `string[]` of 6 hex colors) — consumed by Task 3 (`StaffSettingsTab.jsx`) and already by `CoursesPage.jsx`.

- [ ] **Step 1: Create the shared palette module**

```js
// src/lib/colors.js
/** Общая палитра цветовых пикеров (курсы, сотрудники) — 6 различимых цветов. */
export const PALETTE = ['#22406B', '#E5842B', '#34A853', '#2563EB', '#C0392B', '#8B94A3'];
```

- [ ] **Step 2: Point `CoursesPage.jsx` at the shared constant**

In `src/pages/CoursesPage.jsx`, the file currently starts:

```js
import { useMemo, useState } from 'react';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp, orderBy } from 'firebase/firestore';
import { Plus, Pencil, Archive, BookOpen } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';
import { formatMoney } from '../lib/format.js';

const PALETTE = ['#22406B', '#E5842B', '#34A853', '#2563EB', '#C0392B', '#8B94A3'];

const EMPTY_FORM = { name: '', defaultPrice: '', defaultDurationMonths: '', color: PALETTE[0] };
```

Replace the `const PALETTE = [...]` line with an import, and add the import alongside the other `lib/` import:

```js
import { formatMoney } from '../lib/format.js';
import { PALETTE } from '../lib/colors.js';

const EMPTY_FORM = { name: '', defaultPrice: '', defaultDurationMonths: '', color: PALETTE[0] };
```

(The `const PALETTE = [...]` line is deleted — nothing else in the file changes, `PALETTE` is used exactly as before everywhere else in `CoursesPage.jsx`.)

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: `✓ built in ...`, no errors.

- [ ] **Step 4: Browser check — courses page still works**

Open `http://localhost:5173/#/courses` in the browser preview. Click "Добавить курс" (or edit an existing course). Confirm the 6 color swatches still render and clicking one still selects it (ring highlight moves). This proves the import swap didn't break anything.

- [ ] **Step 5: Commit**

```bash
git add src/lib/colors.js src/pages/CoursesPage.jsx
git commit -m "Extract shared color PALETTE from CoursesPage into lib/colors.js"
```

---

### Task 2: `DropdownMenu` — optional custom trigger icon

**Files:**
- Modify: `src/components/ui/DropdownMenu.jsx` (full file, 71 lines)

**Interfaces:**
- Consumes: nothing new.
- Produces: `DropdownMenu({ items, variant, icon, ariaLabel })` — two new optional props, `icon` (a `lucide-react` component) and `ariaLabel` (string). When omitted, behavior is byte-for-byte identical to today (existing call sites in `StaffSettingsTab.jsx`, `TeachersPage.jsx`, etc. pass neither and are unaffected). Consumed by Task 5 (`LeadCard.jsx`, for the "move to column" trigger button using the `ArrowRight` icon).

- [ ] **Step 1: Replace the file**

```jsx
// src/components/ui/DropdownMenu.jsx
import { useEffect, useRef, useState } from 'react';
import { MoreVertical, ChevronDown } from 'lucide-react';

/**
 * Меню ⋮ в строках таблиц и карточках (Учителя, Группы, Студенты). Триггер
 * по умолчанию — круглая кнопка с ⋮; для сплит-кнопок (карточка студента)
 * передаётся `variant="chevron"` — узкая стрелка ▾, встраиваемая вплотную
 * к основной кнопке в общую пилюлю. Для триггеров с другим смыслом (не
 * "ещё действия", а конкретное действие вроде "перенести") — `icon` и
 * `ariaLabel` переопределяют иконку/подпись, оставляя тот же контейнер и
 * поведение (клик вне — закрыть, Escape — закрыть).
 * @param {Object} props
 * @param {Array<{label: string, onClick: () => void, danger?: boolean, disabled?: boolean, title?: string}>} props.items
 * @param {'icon'|'chevron'} [props.variant]
 * @param {import('react').ComponentType} [props.icon] переопределяет иконку триггера (по умолчанию MoreVertical/ChevronDown по variant)
 * @param {string} [props.ariaLabel] переопределяет aria-label триггера (по умолчанию «Действия»)
 */
export function DropdownMenu({ items, variant = 'icon', icon: Icon, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const TriggerIcon = Icon ?? (variant === 'chevron' ? ChevronDown : MoreVertical);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          variant === 'chevron'
            ? 'flex h-11 w-9 items-center justify-center border-l border-navy text-navy hover:bg-orange-soft/40'
            : 'flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt'
        }
        aria-label={ariaLabel ?? 'Действия'}
      >
        <TriggerIcon className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-10 w-52 rounded-field border border-border bg-surface py-2 shadow-hover">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              title={item.title}
              onClick={() => {
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full px-3 py-2 text-left text-[15px] hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${
                item.danger ? 'text-danger' : 'text-text'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Browser check — existing dropdown menus unaffected**

Open `http://localhost:5173/#/teachers-groups`, open any teacher, click the ⋮ on any group row (or `http://localhost:5173/#/settings` → Сотрудники, click ⋮ on any staff row). Confirm it still opens/closes exactly as before (⋮ icon, same items). This proves the default-icon fallback works.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/DropdownMenu.jsx
git commit -m "DropdownMenu: allow overriding the trigger icon/label"
```

---

### Task 3: `staff.color` field + picker in Settings

**Files:**
- Modify: `src/components/settings/StaffSettingsTab.jsx` (full file, 215 lines)

**Interfaces:**
- Consumes: `PALETTE` from `src/lib/colors.js` (Task 1).
- Produces: `staff/{uid}.color` (hex string or absent) — consumed by Task 7 (`LeadsPage.jsx`, to resolve each lead's operator color).

- [ ] **Step 1: Add the import and the color-change handler**

In `src/components/settings/StaffSettingsTab.jsx`, add to the imports (after the existing `formatPhone` import, before `ROLE_OPTIONS`):

```js
import { formatPhone } from '../../lib/format.js';
import { PALETTE } from '../../lib/colors.js';
import { ROLE_OPTIONS, assignableRoleOptions } from '../../lib/roles.js';
```

Add a new handler right after `handleToggleActive` (which ends at line 64 with the closing `};`):

```js
  const handleColorChange = async (member, color) => {
    try {
      await updateDoc(doc(db, 'staff', member.id), { color, updatedAt: serverTimestamp(), updatedBy: user.uid });
      showToast('Цвет обновлён.');
    } catch {
      showToast('Не удалось изменить цвет.', { type: 'error' });
    }
  };
```

- [ ] **Step 2: Add the "Цвет" column**

In the `columns` array, insert a new column object between the `'role'` column (ends at line 150 with `},`) and the `'isActive'` column (starts at line 151 `{ key: 'isActive', ... }`):

```js
    {
      key: 'color',
      label: 'Цвет',
      render: (m) => {
        // Тот же расклад прав, что у 'role'/'__actions' выше: admin не
        // может трогать документы не-учителей (firestore.rules — update на
        // staff требует role()!='admin' ИЛИ resource.role=='teacher').
        const locked = callerRole === 'admin' && m.role !== 'teacher';
        return (
          <div className="flex gap-1.5">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                disabled={locked}
                title={locked ? 'Администратор не может менять цвет этого сотрудника' : undefined}
                onClick={() => handleColorChange(m, c)}
                className={`h-6 w-6 shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-40 ${
                  m.color === c ? 'ring-2 ring-navy ring-offset-1' : ''
                }`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        );
      },
    },
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Lint check**

Run: `npm run lint`
Expected: same warning count as before this task (no new `no-unused-vars` etc. — `PALETTE` and `handleColorChange` are both used).

- [ ] **Step 5: Browser check — set a color and confirm it persists**

Open `http://localhost:5173/#/settings`, go to "Сотрудники" tab. Click a color swatch on any row. Confirm: (a) a "Цвет обновлён." toast appears, (b) the clicked swatch gets a ring highlight, (c) reload the page — the ring highlight is still on the same swatch (proves the write landed in Firestore, not just local state).

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/StaffSettingsTab.jsx
git commit -m "Add staff.color field with a swatch picker in Settings"
```

---

### Task 4: `leads/columns.js` — shared column model

**Files:**
- Create: `src/components/leads/columns.js`

**Interfaces:**
- Produces:
  - `COLUMNS: Array<{key: string, label: string}>` — the 6 columns in board order.
  - `STAGE_KEYS: string[]` — the 4 keys that map to `student.leadStage` (`'today' | 'tomorrow' | 'next_week' | 'later'`).
  - `columnKeyOf(lead: Object): string` — which column a lead document currently belongs to.
  - Consumed by Task 5 (`LeadCard.jsx`), Task 6 (`LeadColumn.jsx`), Task 7 (`LeadsPage.jsx`).

- [ ] **Step 1: Create the file**

```js
// src/components/leads/columns.js
/**
 * Единая модель 6 колонок kanban-доски «Заявки». Первые 4 — `leadStage`
 * (лид ещё не отработан), последние 2 — `leadResult` (лид на пробном уроке
 * с исходом). Порядок — порядок колонок слева направо на доске.
 */
export const COLUMNS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Следующий день' },
  { key: 'next_week', label: 'На следующей неделе' },
  { key: 'later', label: 'В будущем' },
  { key: 'came', label: 'Пришли' },
  { key: 'not_came', label: 'Не пришли' },
];

export const STAGE_KEYS = COLUMNS.slice(0, 4).map((c) => c.key);

/**
 * Колонка, в которой сейчас находится лид. Лид без `leadResult` живёт по
 * `leadStage` (дефолт 'today', если поле пустое или содержит не наше
 * значение); лид с `leadResult` — во второй паре колонок, `leadStage`
 * игнорируется (та же логика, что в исходном `byStage`/`byResult` до
 * объединения в одну доску).
 * @param {Object} lead
 * @returns {string} один из ключей COLUMNS
 */
export function columnKeyOf(lead) {
  if (lead.leadResult === 'came' || lead.leadResult === 'not_came') return lead.leadResult;
  return STAGE_KEYS.includes(lead.leadStage) ? lead.leadStage : 'today';
}
```

- [ ] **Step 2: Syntax check**

This file isn't imported anywhere yet, so `npm run build` won't touch it (Vite only bundles files reachable from an entry point). Plain JS with no JSX, though, so it can be syntax-checked directly:

Run: `node --check src/components/leads/columns.js`
Expected: no output (silent success).

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/columns.js
git commit -m "Add shared column model for the leads kanban board"
```

---

### Task 5: `LeadCard` component

**Files:**
- Create: `src/components/leads/LeadCard.jsx`

**Interfaces:**
- Consumes: `COLUMNS` from `./columns.js` (Task 4); `DropdownMenu` with `icon`/`ariaLabel` props (Task 2); `Badge` from `../ui/Badge.jsx` (unchanged); `formatPhone`/`formatDate` from `../../lib/format.js` (unchanged).
- Produces: `LeadCard({ lead, operatorColor, operatorName, onOpen, onCall, onEdit, onDecline, onMarkTrial, onMove })` — a draggable card. `onMove(lead, columnKey)` is called both when a move-menu item is clicked. Consumed by Task 6 (`LeadColumn.jsx`).

- [ ] **Step 1: Create the file**

```jsx
// src/components/leads/LeadCard.jsx
import { Phone, ArrowRight } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS } from './columns.js';
import { formatPhone, formatDate } from '../../lib/format.js';

const STATUS_BADGE = {
  lead: { variant: 'type-system', label: 'Лид' },
  trial: { variant: 'status-active', label: 'Пробный' },
};

function initials(fullName) {
  return (fullName ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/**
 * Карточка лида на kanban-доске «Заявки». Перетаскивается мышью (native
 * HTML5 DnD — `draggable`, кладёт свой id в dataTransfer) в любую колонку
 * LeadColumn. Кнопка «→» — то же перемещение по тапу, для тачскринов, где
 * HTML5 DnD не работает вовсе (см. 2026-08-12-leads-kanban-design.md).
 * @param {Object} props
 * @param {Object} props.lead документ `students` со `status` in [lead, trial]
 * @param {string} [props.operatorColor] hex-цвет создателя лида (`staff.color`); без него — нейтральный серый
 * @param {string} [props.operatorName] имя создателя лида, для tooltip на аватаре
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCall
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onMarkTrial
 * @param {(lead: Object, columnKey: string) => void} props.onMove
 */
export function LeadCard({ lead, operatorColor, operatorName, onOpen, onCall, onEdit, onDecline, onMarkTrial, onMove }) {
  const menuItems = [
    ...(lead.status === 'lead' ? [{ label: 'Записать на пробный', onClick: () => onMarkTrial(lead) }] : []),
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    { label: 'Отказ', danger: true, onClick: () => onDecline(lead) },
  ];

  const moveItems = COLUMNS.map((c) => ({ label: c.label, onClick: () => onMove(lead, c.key) }));

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className="flex cursor-grab items-center gap-3 rounded-field border border-border bg-surface px-3 py-2.5 hover:bg-surface-alt active:cursor-grabbing"
    >
      <div
        title={operatorName}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
        style={{ backgroundColor: operatorColor || '#8B94A3' }}
      >
        {initials(lead.fullName)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-text">{lead.fullName}</p>
        <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="text-[13px] text-link">
          {formatPhone(lead.phone)}
        </a>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={STATUS_BADGE[lead.status].variant}>{STATUS_BADGE[lead.status].label}</Badge>
        <span className="text-[12px] text-muted">{formatDate(lead.createdAt)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onCall(lead)}
          aria-label="Позвонить"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt hover:text-navy"
        >
          <Phone className="h-4 w-4" />
        </button>
        <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />
        <DropdownMenu items={menuItems} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: No standalone check — deferred to Task 7**

This file isn't imported anywhere yet (`LeadColumn.jsx`, which imports it, doesn't exist until Task 6), so there's no way to compile-check it in isolation — JSX needs the Vite/Babel pipeline, not plain `node --check`. Task 7's build step is where this file first gets bundled and where a typo here would surface. Commit now, verify in Task 7.

- [ ] **Step 3: Commit**

```bash
git add src/components/leads/LeadCard.jsx
git commit -m "Add LeadCard: draggable kanban card with operator color"
```

---

### Task 6: `LeadColumn` component

**Files:**
- Create: `src/components/leads/LeadColumn.jsx`

**Interfaces:**
- Consumes: `LeadCard` (Task 5).
- Produces: `LeadColumn({ column, leads, operatorByUid, onAdd, onDropLead, ...cardActions })`. `operatorByUid` is a `Map<string, {color?: string, name: string}>` keyed by `staff` doc id (== `lead.createdBy`). `onDropLead(leadId: string, columnKey: string)` fires on a successful HTML5 drop. `cardActions` is spread straight into every `LeadCard` (`onOpen`, `onCall`, `onEdit`, `onDecline`, `onMarkTrial`, `onMove`). Consumed by Task 7 (`LeadsPage.jsx`).

- [ ] **Step 1: Create the file**

```jsx
// src/components/leads/LeadColumn.jsx
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { LeadCard } from './LeadCard.jsx';

/**
 * Одна колонка kanban-доски «Заявки» — заголовок (название/счётчик/+) и
 * drop-зона. Читает id перетаскиваемого лида из dataTransfer (см.
 * LeadCard.onDragStart) и передаёт наверх через onDropLead — сама колонка
 * не решает, что писать в Firestore, это знает только LeadsPage.
 * @param {Object} props
 * @param {{key: string, label: string}} props.column
 * @param {Array<Object>} props.leads лиды этой колонки, уже отфильтрованные
 * @param {Map<string, {color?: string, name: string}>} props.operatorByUid
 * @param {() => void} props.onAdd
 * @param {(leadId: string, columnKey: string) => void} props.onDropLead
 */
export function LeadColumn({ column, leads, operatorByUid, onAdd, onDropLead, ...cardActions }) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-card bg-surface-alt">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[15px] font-bold text-text">{column.label}</span>
        <span className="flex items-center gap-3">
          <span className="text-[13px] font-bold text-muted">{leads.length}</span>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Добавить лида: ${column.label}`}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text"
          >
            <Plus className="h-4 w-4" />
          </button>
        </span>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const leadId = e.dataTransfer.getData('text/plain');
          if (leadId) onDropLead(leadId, column.key);
        }}
        className={`flex-1 space-y-2 border-t px-3 py-3 ${dragOver ? 'border-navy bg-orange-soft/30' : 'border-border'}`}
      >
        {leads.length === 0 ? (
          <p className="py-4 text-center text-[14px] text-muted">Пусто</p>
        ) : (
          leads.map((lead) => {
            const op = operatorByUid.get(lead.createdBy);
            return <LeadCard key={lead.id} lead={lead} operatorColor={op?.color} operatorName={op?.name} {...cardActions} />;
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/leads/LeadColumn.jsx
git commit -m "Add LeadColumn: kanban column with HTML5 drop zone"
```

---

### Task 7: Rewrite `LeadsPage.jsx` as the 6-column board

**Files:**
- Modify: `src/pages/LeadsPage.jsx` (full rewrite, was 259 lines)

**Interfaces:**
- Consumes: `LeadColumn` (Task 6), `COLUMNS`/`STAGE_KEYS`/`columnKeyOf` (Task 4). Reads `staff.color` (Task 3) to build `operatorByUid`.
- Produces: the page itself — no downstream consumers.

- [ ] **Step 1: Replace the file**

```jsx
// src/pages/LeadsPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { CallLogModal } from '../components/students/CallLogModal.jsx';
import { LeadColumn } from '../components/leads/LeadColumn.jsx';
import { COLUMNS, STAGE_KEYS, columnKeyOf } from '../components/leads/columns.js';

/**
 * Заявки — лиды и пробные (`students` с `status` in [lead, trial]), единая
 * kanban-доска в 6 колонок (2026-08-12-leads-kanban-design.md). Перенос
 * между колонками — drag-n-drop или кнопка «→» на карточке (LeadCard).
 * Клик по карточке — на `/students/:id` (там комментарии/история/звонки).
 */
export function LeadsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('status', 'in', ['lead', 'trial']),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId],
  );
  const { data: leads } = useCollection(leadsQuery);

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);

  const operatorByUid = useMemo(() => {
    const map = new Map();
    for (const s of staffList) map.set(s.id, { color: s.color, name: s.fullName });
    return map;
  }, [staffList]);

  const [formLead, setFormLead] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [callTarget, setCallTarget] = useState(null);

  const byColumn = useMemo(() => {
    const map = {};
    for (const c of COLUMNS) map[c.key] = [];
    for (const lead of leads) map[columnKeyOf(lead)].push(lead);
    return map;
  }, [leads]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const patch = async (lead, data, okMessage) => {
    try {
      await updateDoc(doc(db, 'students', lead.id), { ...data, updatedAt: serverTimestamp() });
      if (okMessage) showToast(okMessage);
    } catch {
      showToast('Не удалось обновить лид.', { type: 'error' });
    }
  };

  const moveLead = (lead, columnKey) => {
    if (columnKeyOf(lead) === columnKey) return;
    if (STAGE_KEYS.includes(columnKey)) {
      patch(lead, { leadStage: columnKey, leadResult: null });
    } else {
      patch(lead, { leadResult: columnKey });
    }
  };

  const openAddForm = (columnKey) => {
    setPendingTarget({ columnKey });
    setFormLead({});
  };

  const handleCreated = async (id) => {
    if (!pendingTarget) return;
    const { columnKey } = pendingTarget;
    setPendingTarget(null);
    if (columnKey === 'today') return; // дефолт нового лида уже 'today' — писать нечего
    const data = STAGE_KEYS.includes(columnKey) ? { leadStage: columnKey } : { leadResult: columnKey };
    try {
      await updateDoc(doc(db, 'students', id), { ...data, updatedAt: serverTimestamp() });
    } catch {
      showToast('Не удалось определить лида в раздел.', { type: 'error' });
    }
  };

  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onCall: (lead) => setCallTarget(lead),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onMarkTrial: (lead) => patch(lead, { status: 'trial', trialAt: serverTimestamp() }, `${lead.fullName} записан(а) на пробный.`),
    onMove: moveLead,
  };

  return (
    <>
      <PageHeader
        title="Заявки"
        actions={
          <Button onClick={() => setFormLead({})}>
            <Plus className="h-4 w-4" /> Добавить лида
          </Button>
        }
      />
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((column) => (
          <LeadColumn
            key={column.key}
            column={column}
            leads={byColumn[column.key]}
            operatorByUid={operatorByUid}
            onAdd={() => openAddForm(column.key)}
            onDropLead={(leadId, columnKey) => {
              const lead = leadsById.get(leadId);
              if (lead) moveLead(lead, columnKey);
            }}
            {...cardActions}
          />
        ))}
      </div>

      <StudentFormModal
        student={formLead}
        onClose={() => {
          setFormLead(null);
          setPendingTarget(null);
        }}
        onCreated={handleCreated}
      />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} />
      <CallLogModal open={Boolean(callTarget)} studentId={callTarget?.id} onClose={() => setCallTarget(null)} />
    </>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: `✓ built in ...`, no errors. This is the first point all of Tasks 4-6's new files actually get compiled (they're imported here) — if there's a typo anywhere in `columns.js`, `LeadCard.jsx`, or `LeadColumn.jsx`, it surfaces now.

- [ ] **Step 3: Lint check**

Run: `npm run lint`
Expected: no new warnings introduced by `LeadsPage.jsx`, `LeadCard.jsx`, `LeadColumn.jsx`, or `columns.js` (pre-existing warnings in unrelated files are fine — same list as before this plan).

- [ ] **Step 4: Commit**

```bash
git add src/pages/LeadsPage.jsx
git commit -m "Rewrite LeadsPage as a single 6-column kanban board"
```

---

### Task 8: Full manual verification pass

No files change in this task — it's a checklist run against the live app to confirm the whole feature works end to end, using the browser preview (dev server already running on `http://localhost:5173`, real Firebase project).

**Prerequisite:** in Settings → Сотрудники, make sure at least 2 different staff members have 2 different colors set (Task 3's UI) before starting, otherwise the color check in step 3 has nothing to compare.

- [ ] **Step 1: Board renders**

Open `http://localhost:5173/#/leads`. Confirm: 6 columns render in a single horizontally-scrollable row, in order Сегодня / Следующий день / На следующей неделе / В будущем / Пришли / Не пришли. Every existing lead appears in exactly one column (compare total card count across all columns to the "Quantity" you'd get by counting today's leads — spot check a few names against where they were in the old 2-grid layout, if you noted any beforehand).

- [ ] **Step 2: Drag-and-drop**

Pick a lead card in "Сегодня". Drag it to "Следующий день" (mouse down on the card, move to the target column, release). Confirm: (a) the column you dragged over highlighted while hovering (border/bg tint), (b) after drop the card disappears from "Сегодня" and appears in "Следующий день", (c) the counts in both column headers update.

- [ ] **Step 3: Touch fallback ("→" menu)**

On any card, click the "→" (ArrowRight) icon next to the phone icon. Confirm a menu with all 6 column labels opens. Click "Пришли". Confirm the card moves to the "Пришли" column and its `leadResult` badge/position updates (same effect as a drag would have).

- [ ] **Step 4: Operator color**

Confirm each card's avatar circle is colored per its creator (`lead.createdBy` → `staff.color`), not the old uniform grey. Hover a colored avatar and confirm a tooltip with the operator's name appears (native browser title tooltip). Any lead whose creator has no `color` set yet should show the neutral grey `#8B94A3` fallback, not a blank/broken avatar.

- [ ] **Step 5: Slim menu**

Open the "⋮" menu (not "→") on a `status: 'lead'` card. Confirm exactly 3 items: "Записать на пробный", "Редактировать", "Отказ" — no "Перенести: ..." or "Пришли"/"Не пришли" items (those moved to drag/→). Open it on a `status: 'trial'` card — confirm "Записать на пробный" is absent (matches the original `lead.status === 'lead'` conditional), only "Редактировать"/"Отказ" show.

- [ ] **Step 6: Call button**

Click the phone icon on a card. Confirm the call-log modal opens directly (same as the old "Позвонить" menu item did) — not a page navigation, and the card's own click-to-open (`/students/:id`) does NOT also fire (the `onClick={(e) => e.stopPropagation()}` wrapper around the action buttons must hold).

- [ ] **Step 7: Add lead into a specific column**

Click the "+" in the "Пришли" column header. Fill the create-lead form, submit. Confirm the new lead lands directly in "Пришли" (not "Сегодня"). Repeat once for a non-"Сегодня" stage column (e.g. "Позже") to confirm the `STAGE_KEYS`-vs-`leadResult` branch in `handleCreated` both work.

- [ ] **Step 8: Mobile viewport**

Resize the browser preview to a phone width (375px). Confirm the board scrolls horizontally (swipe/scroll, not squished into an unreadable column). Confirm the "→" move-menu still works via tap (drag isn't expected to work here — that's the whole point of Task 5's fallback).

- [ ] **Step 9: Regression check — Settings/Courses untouched**

Quickly revisit `http://localhost:5173/#/courses` and `http://localhost:5173/#/settings` (Сотрудники tab). Confirm both still look and behave as before this plan (Tasks 1-3 touched shared files — this is the final confirmation nothing there regressed).

If every step above passes, the feature is done. If any step fails, fix the specific file it points at and re-run that step (don't re-run the whole checklist from scratch unless the fix touched shared code from an earlier task).
