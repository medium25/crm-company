# Пробный назначен: звонок-подтверждение перед пробным — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** До дня пробного урока карточка лида на стадии «Пробный назначен»
требует лёгкой отметки звонка-подтверждения («Дозвонились»/«Не берёт
трубку», без лимита попыток) вместо простого текста с датой; если
подтверждения нет к `trialDate − 24ч`, карточка получает стандартную
просрочку, а если последняя попытка — «не берёт трубку», рядом загорается
отдельный оранжевый риск-бейдж. В день пробного карточка ведёт себя как
сейчас («Пришёл»/«Не пришёл»).

**Architecture:** Два новых поля на документе лида —
`trialConfirmDueAt` (Timestamp, `trialDate − 24ч`) и `trialConfirmAttempts`
(массив `{result, at}`, тот же формат, что уже есть у `callAttempts`).
`TrialFormModal` пишет оба поля при назначении и при каждом переносе
пробного (перенос сбрасывает `trialConfirmAttempts`). `stageDeadline()` в
`leadFunnel.js` — единственное место, что решает, просрочена ли карточка;
расширяется новой веткой для `trial_scheduled`, ничего не меняя для
остальных стадий. `LeadCard.jsx` — чисто презентационная логика: до дня
пробного рендерит новый компактный блок вместо текста с датой, в день
пробного — существующий блок «Пришёл»/«Не пришёл» без изменений. Запись
попытки подтверждения — новый обработчик `markTrialConfirm` в
`LeadsPage.jsx`, зеркалирует `markTouch` (простой `updateDoc` через уже
существующий `patch()`), но без `DeadlineModal` — дата фиксирована
(`trialDate − 24ч`), у оператора нет нового выбора при каждой отметке.

**Tech Stack:** React 19, Firestore (`firebase` JS SDK v12, `updateDoc`),
`date-fns` (`differenceInCalendarDays` — уже используется в `format.js`),
`lucide-react` (`PhoneOff` — подтверждён в пакете).

## Global Constraints

- Спек: `docs/superpowers/specs/2026-08-14-trial-confirmation-call-design.md` — источник истины по поведению, читать целиком перед началом.
- Нет test runner в проекте — верификация каждой задачи: `npx vite build`. Задачи 3-4 дополнительно требуют ручной проверки в залогиненной вкладке браузера (Firebase-бэкенд реальный, эмулятора нет; у агента нет доступа к паролю — ручную проверку делает пользователь или следующая сессия с уже открытой авторизованной вкладкой, как было в этой сессии).
- Новых npm-зависимостей не добавлять — `date-fns` и `lucide-react` уже в проекте.
- `DeadlineModal` для этой фичи НЕ используется — дата подтверждения фиксированная (`trialDate − 24ч`), нового выбора даты оператором при отметке попытки нет (см. спек, раздел «Звонок-подтверждение»).
- Каждый элемент `trialConfirmAttempts` — `at: new Date()` на клиенте, не `serverTimestamp()` (тот не поддерживается внутри элемента массива — тот же паттерн, что уже у `callAttempts`, см. `LeadsPage.jsx:163-165`).
- Ключ и порядок стадий (`columns.js`) не трогаем — фича работает целиком внутри существующей стадии `trial_scheduled`.
- Комментарии в коде — только там, где не очевидна причина (например, почему нет `DeadlineModal` для этой конкретной отметки).

---

### Task 1: Хелперы дедлайна подтверждения в leadFunnel.js

**Files:**
- Modify: `src/lib/leadFunnel.js`

**Interfaces:**
- Produces: `trialConfirmDueAt(trialDate: Date): Date`, `isTrialDay(trialDate: Date): boolean` — обе экспортируются, используются в Task 2 (TrialFormModal) и Task 3 (LeadCard). `stageDeadline(lead): Date|null` — поведение расширено для `trial_scheduled`, сигнатура не меняется.

- [ ] **Step 1: Добавить импорт `differenceInCalendarDays`**

В начале файла, рядом с текущим импортом firebase:

```js
// src/lib/leadFunnel.js
import { doc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { differenceInCalendarDays } from 'date-fns';
```

- [ ] **Step 2: Добавить `trialConfirmDueAt()` и `isTrialDay()` после `firstTouchDueAt()`**

Вставить сразу после функции `firstTouchDueAt` (текущие строки 106-120), перед JSDoc `stageDeadline`:

```js
/**
 * Дедлайн звонка-подтверждения перед пробным — trialDate минус 24 часа
 * (спек «Данные»). Пишется на документ лида при назначении и при каждом
 * переносе пробного (TrialFormModal), читается в stageDeadline.
 * @param {Date} trialDate
 * @returns {Date}
 */
export function trialConfirmDueAt(trialDate) {
  return new Date(trialDate.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Наступил ли уже календарный день пробного (или прошёл) — сравнение по
 * дате, не по времени суток. С этого момента карточка показывает
 * «Пришёл»/«Не пришёл» вместо звонка-подтверждения (LeadCard), и дедлайн
 * стадии возвращается к самому trialDate (см. stageDeadline ниже).
 * @param {Date} trialDate
 * @returns {boolean}
 */
export function isTrialDay(trialDate) {
  return differenceInCalendarDays(trialDate, new Date()) <= 0;
}
```

- [ ] **Step 3: Расширить `stageDeadline()` для `trial_scheduled`**

Текущая строка (135):

```js
  if (stage === 'trial_scheduled') return lead.trialDate?.toDate?.() ?? null;
```

Заменить на:

```js
  if (stage === 'trial_scheduled') {
    const trialDate = lead.trialDate?.toDate?.();
    if (!trialDate) return null;
    if (isTrialDay(trialDate)) return trialDate;
    const attempts = lead.trialConfirmAttempts ?? [];
    const lastAttempt = attempts[attempts.length - 1];
    if (lastAttempt?.result === 'success') return null;
    return lead.trialConfirmDueAt?.toDate?.() ?? null;
  }
```

- [ ] **Step 4: Проверить сборку**

Run: `npx vite build`
Expected: `✓ built in <N>ms`, без ошибок.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leadFunnel.js
git commit -m "$(cat <<'EOF'
feat(leads): add trial confirmation deadline helpers

trialConfirmDueAt/isTrialDay + stageDeadline() branch for
trial_scheduled, per docs/superpowers/specs/2026-08-14-trial-confirmation-call-design.md.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: TrialFormModal пишет новые поля при назначении и переносе

**Files:**
- Modify: `src/components/leads/TrialFormModal.jsx`

**Interfaces:**
- Consumes: `trialConfirmDueAt(trialDate: Date): Date` из Task 1 (`src/lib/leadFunnel.js`).
- Produces: на документе `students/{id}` при `mode: 'schedule'` и `mode: 'reschedule'` — новые поля `trialConfirmDueAt: Timestamp`, `trialConfirmAttempts: []`.

- [ ] **Step 1: Импортировать хелпер**

Текущая строка 9:

```js
import { advanceStage } from '../../lib/leadFunnel.js';
```

Заменить на:

```js
import { advanceStage, trialConfirmDueAt } from '../../lib/leadFunnel.js';
```

- [ ] **Step 2: Считать `trialConfirmDueAt` вместе с `trialDate` и писать в оба режима**

Текущий `handleSubmit` (строки 54-84):

```js
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trialDate = Timestamp.fromDate(new Date(`${date}T${time}:00`));
      if (mode === 'schedule') {
        await advanceStage(db, lead, 'trial_scheduled', {
          status: 'trial',
          trialAt: serverTimestamp(),
          trialDate,
          trialTeacherId: teacherId || null,
        }, user);
        showToast(`${lead.fullName}: пробный назначен.`);
      } else {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'students', lead.id), {
          trialDate,
          trialTeacherId: teacherId || null,
          rescheduleCount: (lead.rescheduleCount ?? 0) + 1,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        showToast(`${lead.fullName}: пробный перенесён.`);
      }
      onClose();
    } catch {
      showToast('Не удалось сохранить дату пробного.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };
```

Заменить на:

```js
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trialDateJs = new Date(`${date}T${time}:00`);
      const trialDate = Timestamp.fromDate(trialDateJs);
      // Перенос тоже пересчитывает confirmDueAt и обнуляет попытки — старые
      // попытки дозвона относились к прежней дате пробного (спек «Перенос
      // пробного сбрасывает цикл подтверждения»).
      const confirmDueAt = Timestamp.fromDate(trialConfirmDueAt(trialDateJs));
      if (mode === 'schedule') {
        await advanceStage(db, lead, 'trial_scheduled', {
          status: 'trial',
          trialAt: serverTimestamp(),
          trialDate,
          trialTeacherId: teacherId || null,
          trialConfirmDueAt: confirmDueAt,
          trialConfirmAttempts: [],
        }, user);
        showToast(`${lead.fullName}: пробный назначен.`);
      } else {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'students', lead.id), {
          trialDate,
          trialTeacherId: teacherId || null,
          trialConfirmDueAt: confirmDueAt,
          trialConfirmAttempts: [],
          rescheduleCount: (lead.rescheduleCount ?? 0) + 1,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        showToast(`${lead.fullName}: пробный перенесён.`);
      }
      onClose();
    } catch {
      showToast('Не удалось сохранить дату пробного.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };
```

- [ ] **Step 3: Проверить сборку**

Run: `npx vite build`
Expected: `✓ built in <N>ms`, без ошибок.

- [ ] **Step 4: Commit**

```bash
git add src/components/leads/TrialFormModal.jsx
git commit -m "$(cat <<'EOF'
feat(leads): write trialConfirmDueAt/trialConfirmAttempts on schedule+reschedule

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Блок звонка-подтверждения на карточке (до дня пробного)

**Files:**
- Modify: `src/pages/LeadsPage.jsx`
- Modify: `src/components/leads/LeadCard.jsx`

**Interfaces:**
- Consumes: `isTrialDay(trialDate: Date): boolean` из Task 1.
- Produces: `markTrialConfirm(lead: Object, result: 'success'|'fail'): void` в `LeadsPage.jsx`, передаётся в `cardActions` как `onMarkTrialConfirm`. `LeadCard` — новый проп `onMarkTrialConfirm: (lead, result) => void`, новый внутренний компонент `TrialConfirmBlock`.

- [ ] **Step 1: Добавить `markTrialConfirm` в LeadsPage.jsx**

Вставить после `markTouch` (текущие строки 221-238), перед `openAddForm`:

```js
  // Без DeadlineModal — дата подтверждения фиксирована (trialDate минус
  // 24ч, см. TrialFormModal), у оператора нет нового выбора при каждой
  // отметке, попыток сколько угодно (спек «Звонок-подтверждение»).
  const markTrialConfirm = (lead, result) => {
    const attempts = [...(lead.trialConfirmAttempts ?? []), { result, at: new Date() }];
    patch(lead, { trialConfirmAttempts: attempts });
  };
```

- [ ] **Step 2: Прокинуть в `cardActions`**

Текущая строка 278:

```js
    onMarkAttempt: markAttempt,
```

Заменить на:

```js
    onMarkAttempt: markAttempt,
    onMarkTrialConfirm: markTrialConfirm,
```

- [ ] **Step 3: Проверить сборку**

Run: `npx vite build`
Expected: `✓ built in <N>ms`, без ошибок. (UI пока не читает новый проп — визуально ничего не изменится, это ожидаемо на этом шаге.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/LeadsPage.jsx
git commit -m "$(cat <<'EOF'
feat(leads): add markTrialConfirm handler for trial confirmation calls

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Импортировать `isTrialDay` и `PhoneOff` в LeadCard.jsx**

Текущие строки 1-6:

```js
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight, AlertTriangle } from 'lucide-react';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS, isForwardAllowed } from './columns.js';
import { isPriorityLead, stageDeadline, callScheduleHint, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDate, formatDateTime } from '../../lib/format.js';
```

Заменить на (добавлены `PhoneOff` и `isTrialDay`; `PhoneOff` используется в Task 4, импортируем сразу одним заходом, чтобы не трогать эти строки дважды):

```js
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight, AlertTriangle, PhoneOff } from 'lucide-react';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS, isForwardAllowed } from './columns.js';
import { isPriorityLead, stageDeadline, callScheduleHint, isTrialDay, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDate, formatDateTime } from '../../lib/format.js';
```

- [ ] **Step 6: Добавить компонент `TrialConfirmBlock`**

Вставить после `EngagementPopover` (текущие строки 104-146), перед JSDoc `LeadCard`:

```js
/**
 * Блок звонка-подтверждения на стадии «Пробный назначен» до дня пробного
 * (заменяет собой текст с датой) — см. 2026-08-14-trial-confirmation-call-
 * design.md. Попыток сколько угодно, без DeadlineModal: дата дедлайна уже
 * фиксирована (trialDate минус 24ч), тут нечего выбирать.
 * @param {(result: 'success'|'fail') => Promise<void>|void} onMark
 */
function TrialConfirmBlock({ onMark }) {
  const [pending, setPending] = useState(false);

  const mark = async (result) => {
    setPending(true);
    await onMark(result);
    setPending(false);
  };

  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="truncate text-muted">Подтвердить пробный</span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={() => mark('fail')}
          className="rounded-field border border-border px-2 py-1 text-[12px] text-muted hover:bg-surface-alt disabled:opacity-50"
        >
          Не берёт трубку
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => mark('success')}
          className="rounded-field border border-border px-2 py-1 text-[12px] font-bold text-text hover:bg-surface-alt disabled:opacity-50"
        >
          Дозвонились
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Принять новый проп `onMarkTrialConfirm`**

Текущие строки 167-182:

```js
export function LeadCard({
  lead,
  operatorColor,
  operatorName,
  onOpen,
  onCall,
  onEdit,
  onDecline,
  onScheduleTrial,
  onRescheduleTrial,
  onMarkAttended,
  onMarkTouch,
  onMove,
  onMarkAttempt,
  columns = COLUMNS,
}) {
```

Заменить на:

```js
export function LeadCard({
  lead,
  operatorColor,
  operatorName,
  onOpen,
  onCall,
  onEdit,
  onDecline,
  onScheduleTrial,
  onRescheduleTrial,
  onMarkAttended,
  onMarkTouch,
  onMove,
  onMarkAttempt,
  onMarkTrialConfirm,
  columns = COLUMNS,
}) {
```

Также добавить строку в JSDoc блок над `LeadCard` (текущая строка 165, после `@param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt`):

```js
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkTrialConfirm
```

- [ ] **Step 8: Условный рендер — блок подтверждения до дня пробного, иначе текущие кнопки**

Текущий блок `trial_scheduled` (строки 251-265):

```js
      {stage === 'trial_scheduled' && (
        <div className="flex items-center justify-between gap-2 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-muted">{lead.trialDate ? formatDateTime(lead.trialDate) : 'Дата не указана'}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onRescheduleTrial(lead)}
              className="rounded-field border border-border px-2 py-1 text-[12px] text-muted hover:bg-surface-alt"
            >
              Не пришёл
            </button>
            <EngagementPopover onPick={(score) => onMarkAttended(lead, score)} />
          </div>
        </div>
      )}
```

Заменить на:

```js
      {stage === 'trial_scheduled' && trialDateJs && !isTrialDay(trialDateJs) && (
        <div onClick={(e) => e.stopPropagation()}>
          <TrialConfirmBlock onMark={(result) => onMarkTrialConfirm(lead, result)} />
        </div>
      )}

      {stage === 'trial_scheduled' && (!trialDateJs || isTrialDay(trialDateJs)) && (
        <div className="flex items-center justify-between gap-2 text-[12px]" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-muted">{lead.trialDate ? formatDateTime(lead.trialDate) : 'Дата не указана'}</span>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onRescheduleTrial(lead)}
              className="rounded-field border border-border px-2 py-1 text-[12px] text-muted hover:bg-surface-alt"
            >
              Не пришёл
            </button>
            <EngagementPopover onPick={(score) => onMarkAttended(lead, score)} />
          </div>
        </div>
      )}
```

- [ ] **Step 9: Вычислить `trialDateJs`**

Добавить рядом с существующим `createdAt` (текущая строка 188, `const createdAt = lead.createdAt?.toDate?.();`), сразу после неё:

```js
  const trialDateJs = lead.trialDate?.toDate?.();
```

- [ ] **Step 10: Проверить сборку**

Run: `npx vite build`
Expected: `✓ built in <N>ms`, без ошибок.

- [ ] **Step 11: Ручная проверка в браузере** (требует залогиненной вкладки — попросить пользователя выполнить или выполнить самостоятельно, если сессия уже авторизована)

1. Открыть доску «Заявки», найти любой лид на стадии «Пробный назначен» (или назначить пробный новому лиду через «⋮» → «Записать на пробный» с датой **завтра**).
2. Убедиться: карточка показывает «Подтвердить пробный» с кнопками «Не берёт трубку» / «Дозвонились» вместо старой строки с датой.
3. Кликнуть «Не берёт трубку» — карточка не должна ломаться, кнопки остаются кликабельными (лимита нет).
4. Назначить/перенести другой лид на пробный с датой **сегодня** — убедиться, что на его карточке по-прежнему старые кнопки «Пришёл»/«Не пришёл» (день пробного — блок подтверждения не показывается).

- [ ] **Step 12: Commit**

```bash
git add src/components/leads/LeadCard.jsx
git commit -m "$(cat <<'EOF'
feat(leads): pre-trial confirmation-call block on trial_scheduled cards

Shows Дозвонились/Не берёт трубку instead of the plain trial-date row
until the day of the trial, when it swaps back to the existing
Пришёл/Не пришёл buttons unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Риск-бейдж «не берёт трубку»

**Files:**
- Modify: `src/components/leads/LeadCard.jsx`

**Interfaces:**
- Consumes: `lead.trialConfirmAttempts` (записан в Task 2/3), `PhoneOff` (импортирован в Task 3, Step 5).

- [ ] **Step 1: Вычислить `trialConfirmAtRisk`**

Добавить рядом с `trialDateJs` (добавлен в Task 3, Step 9), сразу после него:

```js
  // Риск-бейдж независим от даты (в отличие от overdue) — загорается сразу
  // после первой неудачной попытки подтверждения, даже если до дедлайна
  // ещё далеко (спек «Риск-бейдж»).
  const trialConfirmAttempts = lead.trialConfirmAttempts ?? [];
  const trialConfirmAtRisk = stage === 'trial_scheduled' && trialConfirmAttempts[trialConfirmAttempts.length - 1]?.result === 'fail';
```

- [ ] **Step 2: Показать иконку рядом с существующим ⚠**

Текущий верхний ряд карточки (строки 224-232):

```js
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
        <div className="flex shrink-0 items-center gap-1">
          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-label="Дедлайн этапа просрочен" />}
          <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
            {formatPhone(lead.phone)}
          </a>
        </div>
      </div>
```

Заменить на:

```js
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
        <div className="flex shrink-0 items-center gap-1">
          {overdue && <AlertTriangle className="h-3.5 w-3.5 text-danger" aria-label="Дедлайн этапа просрочен" />}
          {trialConfirmAtRisk && <PhoneOff className="h-3.5 w-3.5 text-orange" aria-label="Не берёт трубку — подтверждение пробного" />}
          <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
            {formatPhone(lead.phone)}
          </a>
        </div>
      </div>
```

- [ ] **Step 3: Проверить сборку**

Run: `npx vite build`
Expected: `✓ built in <N>ms`, без ошибок.

- [ ] **Step 4: Ручная проверка в браузере**

1. На карточке из Task 3 (пробный завтра) нажать «Не берёт трубку».
2. Убедиться: рядом с телефоном появилась оранжевая иконка «телефон с крестом».
3. Нажать «Дозвонились» — иконка должна исчезнуть.
4. Нажать «Не берёт трубку» ещё раз — иконка появляется снова (без ограничения по количеству попыток).

- [ ] **Step 5: Commit**

```bash
git add src/components/leads/LeadCard.jsx
git commit -m "$(cat <<'EOF'
feat(leads): risk badge for unreachable trial confirmation

Orange PhoneOff icon next to the existing overdue triangle — lights
up on the latest confirm attempt being 'fail', independent of the
date-based overdue signal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
