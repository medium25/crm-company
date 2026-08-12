# Карточка лида: счётчик попыток дозвона + тег оператора — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить круглый аватар оператора на карточке лида цветным тегом
с именем, убрать иконку телефона, и добавить ряд из 5 кликабельных точек для
быстрой отметки результата попытки дозвона (успех/неудача) — каждая отметка
пишется в существующую историю звонков и денормализуется на сам документ
лида для мгновенного рендера на доске.

**Architecture:** Firestore-запись остаётся централизованной в
`LeadsPage.jsx` (как `moveLead`/`patch` уже сейчас) — новый обработчик
`markAttempt(lead, result)` пишет одним batch и в `callLogs` (источник
правды для вкладки «История звонков»), и в `students/{id}.callAttempts`
(денормализованный кэш для точек на доске, без доп. подписок на карточку).
`LeadCard.jsx` — чисто презентационные изменения: тег оператора, ряд точек
с локальным поповером выбора результата, значок «холодный лид», кнопка
«Записать звонок» переезжает из отдельной иконки в меню «⋮».

**Tech Stack:** React 19, Firestore (`firebase` JS SDK v12,
`writeBatch`/`updateDoc`/`serverTimestamp`), Tailwind CSS, `lucide-react`
(`CheckCircle2`, `XCircle`, `Circle`, `Snowflake` — уже подтверждены в
пакете).

## Global Constraints

- Спек: `docs/superpowers/specs/2026-08-12-lead-card-call-attempts-design.md` — источник истины по поведению, читать целиком перед началом.
- Нет test runner в проекте — верификация каждой задачи: `npm run build` + `npm run lint`, плюс ручная проверка в браузере на финальной задаче (dev-сервер уже поднят на localhost:5173).
- Новых npm-зависимостей не добавлять.
- Каждая запись в Firestore — `updatedAt: serverTimestamp()` на документе (не внутри массива — `serverTimestamp()` внутри элемента массива не поддерживается Firestore, поэтому у элемента `callAttempts` — `at: new Date()` на клиенте).
- Быстрая отметка пишет `result: 'reached'` (успех) или `result: 'no_answer'` (неудача) в `callLogs` — переиспользует существующий enum `RESULT_LABELS` (`CallLogsTab.jsx`), новых значений результата не вводим. Помечается `quickMark: true`.
- Права Firestore не меняются — `callLogs` и `students` уже пишутся/читаются `isAdmin()`, то же множество ролей, что работает с «Заявками» (см. спек, раздел «Данные»). Трогать `firestore.rules` не нужно.
- Комментарии в коде — только там, где не очевидно ПОЧЕМУ (например: почему `at: new Date()`, а не `serverTimestamp()`, внутри массива).

---

### Task 1: Firestore-запись попытки дозвона в LeadsPage

**Files:**
- Modify: `src/pages/LeadsPage.jsx`

**Interfaces:**
- Consumes: `useAuth()` из `src/hooks/useAuth.js` — `{ user, staff }`, тот же паттерн, что в `CallLogModal.jsx` (`user.uid`, `staff?.fullName`).
- Produces: `markAttempt(lead, result)` — `result: 'success' | 'fail'`; добавляется в объект `cardActions` под ключом `onMarkAttempt`, который `LeadColumn` уже прокидывает во все `LeadCard` через `{...cardActions}` (см. `LeadColumn.jsx:55`). Task 2 читает этот проп по имени `onMarkAttempt`.

- [ ] **Step 1: Добавить импорты**

В `src/pages/LeadsPage.jsx` заменить строку импорта из `firebase/firestore` и добавить импорт `useAuth`:

```js
import { collection, doc, query, where, orderBy, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
```

(добавлен `writeBatch` к существующему списку). И добавить новый импорт рядом с `useCollection`:

```js
import { useAuth } from '../hooks/useAuth.js';
```

- [ ] **Step 2: Получить `user`/`staff` внутри компонента**

Внутри `export function LeadsPage() {`, сразу после `const { showToast } = useToast();`, добавить:

```js
  const { user, staff } = useAuth();
```

- [ ] **Step 3: Добавить обработчик `markAttempt`**

После существующей функции `patch` (после её закрывающей `};`, перед `const moveLead = ...`), добавить:

```js
  const markAttempt = async (lead, result) => {
    const attempts = lead.callAttempts ?? [];
    if (attempts.length >= 5) return;
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'callLogs')), {
        studentId: lead.id,
        direction: 'out',
        result: result === 'success' ? 'reached' : 'no_answer',
        comment: '',
        durationSec: 0,
        quickMark: true,
        userId: user.uid,
        userName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      // serverTimestamp() внутри элемента массива не поддерживается Firestore —
      // для callAttempts используем клиентское время, updatedAt документа ниже уже серверное.
      batch.update(doc(db, 'students', lead.id), {
        callAttempts: [...attempts, { result, at: new Date() }],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch {
      showToast('Не удалось отметить попытку.', { type: 'error' });
    }
  };
```

- [ ] **Step 4: Прокинуть в `cardActions`**

В объекте `cardActions` (сейчас заканчивается на `onMove: moveLead,`) добавить новую строку:

```js
  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onCall: (lead) => setCallTarget(lead),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onMarkTrial: (lead) => patch(lead, { status: 'trial', trialAt: serverTimestamp() }, `${lead.fullName} записан(а) на пробный.`),
    onMove: moveLead,
    onMarkAttempt: markAttempt,
  };
```

- [ ] **Step 5: Собрать и проверить линт**

Run: `npm run build`
Expected: сборка проходит без ошибок.

Run: `npm run lint`
Expected: без новых предупреждений в `src/pages/LeadsPage.jsx` (существующие предупреждения в других файлах — не в счёт).

`LeadCard.jsx` из Task 2 ещё не читает `onMarkAttempt` — до его выполнения проп просто не используется, поведение доски не меняется. Ручная проверка в браузере — по итогам Task 2.

- [ ] **Step 6: Commit**

```bash
git add src/pages/LeadsPage.jsx
git commit -m "Add markAttempt handler: quick call-attempt marks write to callLogs + lead doc"
```

---

### Task 2: Редизайн LeadCard — тег оператора, точки дозвона, меню

**Files:**
- Modify: `src/components/leads/LeadCard.jsx`

**Interfaces:**
- Consumes: `onMarkAttempt(lead, result)` из Task 1 (проп `LeadCard` получает через `{...cardActions}`, как и остальные `on*`-пропы). `lead.callAttempts` — массив `{result: 'success'|'fail', at: Timestamp|Date}` (может отсутствовать на старых документах — читать через `lead.callAttempts ?? []`).
- Produces: ничего нового для других файлов — `LeadColumn.jsx` не меняется, он уже прокидывает `operatorColor`/`operatorName`/`{...cardActions}` без изменений (не завязан на конкретный набор пропов).

- [ ] **Step 1: Заменить весь файл**

Полностью заменить содержимое `src/components/leads/LeadCard.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Circle, Snowflake, ArrowRight } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { COLUMNS } from './columns.js';
import { formatPhone, formatDate } from '../../lib/format.js';

const STATUS_BADGE = {
  lead: { variant: 'type-system', label: 'Лид' },
  trial: { variant: 'status-active', label: 'Пробный' },
};

const MAX_ATTEMPTS = 5;

/**
 * Ряд из 5 точек — попытки дозвона (2026-08-12-lead-card-call-attempts-design.md).
 * Кликабельна только следующая пустая точка — попытки идут по порядку.
 * Клик открывает попап «Успешно / Не успешно»; выбор красит точку и
 * закрывает попап. Заполненные точки не кликабельны. Если все 5 —
 * неудача, рядом появляется значок «холодный лид».
 */
function CallAttemptDots({ attempts, onMark }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isCold = attempts.length === MAX_ATTEMPTS && attempts.every((a) => a.result === 'fail');

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
          const attempt = attempts[i];
          if (attempt) {
            const Icon = attempt.result === 'success' ? CheckCircle2 : XCircle;
            return <Icon key={i} className={`h-4 w-4 ${attempt.result === 'success' ? 'text-success' : 'text-danger'}`} />;
          }
          if (i === attempts.length) {
            return (
              <div key={i} ref={ref} className="relative">
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-label={`Попытка ${i + 1}: отметить результат звонка`}
                  className="flex h-4 w-4 items-center justify-center text-border hover:text-navy"
                >
                  <Circle className="h-4 w-4" />
                </button>
                {open && (
                  <div className="absolute left-1/2 top-6 z-10 w-40 -translate-x-1/2 rounded-field border border-border bg-surface py-1 shadow-hover">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onMark('success');
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-text hover:bg-surface-alt"
                    >
                      ✓ Успешно
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onMark('fail');
                      }}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-danger hover:bg-surface-alt"
                    >
                      ✕ Не успешно
                    </button>
                  </div>
                )}
              </div>
            );
          }
          return <Circle key={i} className="h-4 w-4 text-border" />;
        })}
      </div>
      {isCold && (
        <span title="Холодный лид: 5 неудачных попыток дозвона" className="flex items-center">
          <Snowflake className="h-4 w-4 text-danger" />
        </span>
      )}
    </div>
  );
}

/**
 * Карточка лида на kanban-доске «Заявки». Перетаскивается мышью (native
 * HTML5 DnD — `draggable`, кладёт свой id в dataTransfer) в любую колонку
 * LeadColumn. Кнопка «→» — то же перемещение по тапу, для тачскринов, где
 * HTML5 DnD не работает вовсе (см. 2026-08-12-leads-kanban-design.md).
 * @param {Object} props
 * @param {Object} props.lead документ `students` со `status` in [lead, trial]
 * @param {string} [props.operatorColor] hex-цвет создателя лида (`staff.color`); без него — нейтральный серый
 * @param {string} [props.operatorName] имя создателя лида — первое слово идёт в тег на карточке
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onCall открывает полную форму записи звонка
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onMarkTrial
 * @param {(lead: Object, columnKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt быстрая отметка попытки дозвона
 */
export function LeadCard({ lead, operatorColor, operatorName, onOpen, onCall, onEdit, onDecline, onMarkTrial, onMove, onMarkAttempt }) {
  const menuItems = [
    ...(lead.status === 'lead' ? [{ label: 'Записать на пробный', onClick: () => onMarkTrial(lead) }] : []),
    { label: 'Записать звонок', onClick: () => onCall(lead) },
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    { label: 'Отказ', danger: true, onClick: () => onDecline(lead) },
  ];

  const moveItems = COLUMNS.map((c) => ({ label: c.label, onClick: () => onMove(lead, c.key) }));
  const attempts = lead.callAttempts ?? [];
  const operatorLabel = (operatorName ?? '').split(' ')[0];

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
      className="group flex cursor-grab flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-navy/20 hover:shadow-md active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[14px] font-bold leading-tight text-text">{lead.fullName}</p>
        <Badge variant={STATUS_BADGE[lead.status].variant} className="shrink-0">
          {STATUS_BADGE[lead.status].label}
        </Badge>
      </div>

      {operatorLabel && (
        <span
          className="inline-flex w-fit items-center rounded-badge px-2 py-0.5 text-[11px] font-bold text-white"
          style={{ backgroundColor: operatorColor || '#8B94A3' }}
        >
          {operatorLabel}
        </span>
      )}

      <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="block truncate text-[13px] text-link">
        {formatPhone(lead.phone)}
      </a>

      <div onClick={(e) => e.stopPropagation()}>
        <CallAttemptDots attempts={attempts} onMark={(result) => onMarkAttempt(lead, result)} />
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-[12px] text-muted">{formatDate(lead.createdAt)}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />
          <DropdownMenu items={menuItems} />
        </div>
      </div>
    </div>
  );
}
```

Ключевые отличия от текущей версии: убран `initials()` (больше не используется — аватара нет), убран импорт `Phone` (иконка телефона у номера и отдельная кнопка звонка убраны), новый локальный компонент `CallAttemptDots`, тег оператора вместо аватара, «Записать звонок» — четвёртым пунктом в `menuItems` вместо отдельной кнопки.

- [ ] **Step 2: Собрать и проверить линт**

Run: `npm run build`
Expected: сборка проходит без ошибок.

Run: `npm run lint`
Expected: без новых предупреждений в `src/components/leads/LeadCard.jsx` (в частности — не должно быть `no-unused-vars` на удалённых `Phone`/`initials`).

- [ ] **Step 3: Ручная проверка в браузере**

Dev-сервер уже поднят на `localhost:5173`. Открыть `/leads`:

1. Карточка лида показывает: имя + бейдж статуса сверху, цветной тег с именем оператора (или ничего, если у оператора нет `staff.color`/имени), номер телефона без иконки, ряд из 5 серых точек, затем разделитель, дата + иконки «→»/«⋮».
2. Клик по первой точке → открывается попап «✓ Успешно / ✕ Не успешно», карточка **не** открывает страницу студента (клик не всплывает).
3. Выбрать «✓ Успешно» → точка становится зелёной галочкой, следующая точка становится кликабельной.
4. Открыть карточку студента (клик по остальной части карточки) → вкладка «История звонков» показывает новую запись «Исходящий — Дозвонились» с текущим временем.
5. Отметить оставшиеся 4 точки как «✕ Не успешно» на любом другом лиде (или той же карточке, если первая попытка тоже была неудачной у другого лида) → после 5-й неудачной точки рядом появляется снежинка с тултипом «Холодный лид: 5 неудачных попыток дозвона».
6. Открыть меню «⋮» на любой карточке → первым/вторым пунктом (в зависимости от статуса) видно «Записать звонок» → клик открывает полную форму (направление/результат/длительность/комментарий), сохранение работает как раньше.
7. Убедиться, что перенос между колонками (drag-n-drop и кнопка «→») по-прежнему работает — карточка не задета логикой Task 1/2.

- [ ] **Step 4: Commit**

```bash
git add src/components/leads/LeadCard.jsx
git commit -m "Redesign LeadCard: operator tag instead of avatar, 5-dot call-attempt tracker"
```

---

## Post-plan

После двух задач — ручная регрессия (drag-n-drop, добавление лида в колонку, `/teachers-groups`, `/settings` — как в Task 8 предыдущего плана) и финальный ревью всей ветки перед мержем в `main`, по той же схеме, что и в `2026-08-12-leads-kanban.md`.
