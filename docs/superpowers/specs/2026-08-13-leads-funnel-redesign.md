# Заявки: 7-стадийная воронка вместо date-bucket доски

## Проблема

Текущая доска «Заявки» (`LeadsPage.jsx`, `2026-08-12-leads-kanban-design.md`)
— 6 колонок по дате следующего касания и результату пробного
(`Сегодня/Завтра/След. неделя/Позже/Пришли/Не пришли`), управляемых полями
`leadStage`/`leadResult`. Это удобно для «когда напомнить», но не отражает
реальную воронку продаж: нет стадий («звоним» vs «пробный назначен» vs
«дожимаем»), нет закреплённого оператора, нет SLA на первый контакт, нет
структурированной причины отказа, нет отчёта по воронке.

Источник требований — `icon-leads-kanban-prompt.md` (промпт пользователя,
полностью в скоупе этой итерации). Два пункта из промпта требуют внешней
инфраструктуры, которой в проекте нет (статический хостинг на GitHub Pages,
Firestore без Cloud Functions, нет Telegram-бота): SLA-эскалация
руководителю и Telegram-напоминания о пробном. Решено делать оба —
**только визуально в приложении**, без реальной отправки уведомлений, пока
не будет отдельно решено разворачивать Cloud Functions + Telegram bot.

## Что меняется

### 1. Модель стадий (`funnelStage`)

Новое поле `students/{id}.funnelStage`, заменяет `leadStage`/`leadResult`
(поля удаляются — используются только в `columns.js`, `LeadCard.jsx`,
`LeadsPage.jsx`, `StudentFormModal.jsx`, больше нигде в кодовой базе):

```
'new' | 'calling' | 'trial_scheduled' | 'trial_completed' | 'closing' | 'won' | 'lost'
```

Доска — 7 колонок в этом порядке. Перенос карточки — только вперёд по
списку (текущий индекс → любой больший индекс, не обязательно соседний —
пропуск стадий вручную разрешён, промпт не требует строго последовательного
шага) плюс в `lost` из любой стадии в любой момент. Назад — запрещено.
Both DnD (`onDrop` в `LeadColumn.jsx`) и меню «→» — проверяют это правило;
запрещённые пункты в меню «→» не рендерятся вовсе (не просто disabled).

`won`/`lost` — терминальные, карточка перестаёт быть draggable и «→» не
показывается (только «⋮» с просмотром).

### 2. Round-robin назначение (`assignedOperator`)

Новое поле `students/{id}.assignedOperator` (uid) — выставляется один раз
при создании лида (`funnelStage: 'new'`), не меняется до `won`/`lost`.
Круговое распределение по списку операторов филиала — тот же набор, что
сейчас работает с «Заявками» (`staff` где `branchIds array-contains
activeBranchId`, роль ceo/manager/admin), отсортированный по `fullName`
для стабильного порядка.

Счётчик очереди — новое поле `settings/{branchId}.lastRoundRobinIndex`
(number). При создании лида: прочитать текущий индекс, назначить оператора
`operators[index % operators.length]`, записать `index + 1` обратно —
одной транзакцией `runTransaction`, чтобы два одновременных создания лида
не назначили одного и того же оператора дважды подряд.

Карточка лида — тег оператора уже показывает `assignedOperator` (переиспользуем
существующий цветной pill из `LeadCard.jsx`, просто источник uid меняется с
`createdBy` на `assignedOperator`).

### 3. SLA 15 минут — визуально

Пока `funnelStage === 'new'`: дедлайн ответа — `createdAt + 15 минут`, но
если `createdAt` вне 9:00–18:00 или в выходной — дедлайн отсчитывается от
9:00 следующего рабочего дня. Соответствует полю `priority` (промпт) —
вычисляется на лету из `createdAt`, отдельного поля не заводим (чистая
функция от даты, пересчитывать негде хранить нечего).

Если текущее время после дедлайна и `funnelStage` всё ещё `'new'` — карточка
получает красную рамку/бейдж «Просрочен ответ». Приоритетные лиды
(созданы вне рабочих часов) — цветная левая полоса на карточке. Пересчёт —
`setInterval` раз в минуту на доске (форс ре-рендер), т.к. Firestore не
уведомит о том, что «стало больше 15 минут» сам по себе.

«Эскалация руководителю» — реализуется тем, что красная рамка видна **всем**,
кто открыл `/leads` (доска уже показывает все лиды филиала, не только свои)
— отдельного уведомления не шлём.

### 4. Дозвон — авто-переход + подсказка расписания

Существующий трекер 5 точек (`CallAttemptDots`, `2026-08-12-lead-card-call-
attempts-design.md`) остаётся как есть. Добавляется:

- Первая отметка попытки (успех или неудача) при `funnelStage === 'new'` →
  авто-переход в `'calling'` (в том же `markAttempt` в `LeadsPage.jsx`,
  тем же batch/транзакцией, что пишет попытку).
- Все 5 попыток неудачны (переиспользуем существующий `isCold`) → авто-переход
  в `'lost'`, `lostReason: 'no_answer'`, `lostAt: serverTimestamp()`.
- Успешная отметка при `status === 'lead'` (лид согласился на пробный) —
  оператор жмёт «Записать на пробный» (см. §5), это и есть выход в
  `trial_scheduled`; явного отдельного действия «дозвонился, согласен» не
  вводим — экономим шаг, оператор просто сразу планирует пробный.
- Подсказка расписания под точками — не хранимое поле, а вычисляемый
  текст по числу уже сделанных попыток: 0-1 попытка → «Ещё сегодня», 2
  попытки → «Ещё сегодня» (2 в день), 3 → «Завтра», 4 → «Завтра» (2 в
  день), 5 (если ещё не cold, т.е. была хоть одна успешная) — подсказка не
  показывается. Чисто информационная строка, без пуш-напоминаний.

### 5. Пробный — форма + учёт явки

`students/{id}` — новые поля: `trialDate` (Timestamp), `trialTeacherId`
(string | null), `rescheduleCount` (number, default 0), `attended`
(boolean | null), `engagementScore` ('low'|'medium'|'high' | null).

«Записать на пробный» (сейчас — прямой `patch()` без диалога) становится
маленькой модалкой: дата+время пробного (`DatePicker`, уже есть в проекте —
`AddPaymentModal.jsx` его использует), учитель (`Select` из `teachers` где
`branchIds array-contains activeBranchId`, тот же паттерн, что в
`GroupFormModal.jsx`). Сохранение → `status:'trial'`, `funnelStage:
'trial_scheduled'`, `trialAt`, `trialDate`, `trialTeacherId`.

На карточке в стадии `trial_scheduled` — компактный обратный отсчёт до
`trialDate` («Пробный через 2ч» / «Пробный завтра в 14:00») — визуальная
замена Telegram-напоминаний за день/час, никакой реальной отправки.

Новые действия в меню «⋮» карточки при `funnelStage === 'trial_scheduled'`:
- **«Не пришёл»** — `rescheduleCount += 1`, открывает ту же мини-форму даты
  пробного для новой даты. Стадия не меняется (карточка остаётся в
  `trial_scheduled` — прямое требование промпта).
- **«Пришёл»** — маленький попап `engagementScore` (low/medium/high, 3
  кнопки, тот же паттерн, что попап «Успешно/Не успешно» у точек дозвона)
  → `attended: true`, `engagementScore`, `funnelStage: 'trial_completed'`.

`rescheduleCount >= 3` — не блокирует и не авто-переводит в `lost`
(промпт даёт нечёткий диапазон «2-3 попытки», авто-правило на нечёткой
границе может тихо потерять лида) — просто снимается плашка «Ещё сегодня»
из §4-подсказки, decision остаётся за оператором (жмёт «Отказ» сам, причина
`no_show`).

### 6. Дожим — 3 касания

Вход в `trial_completed` без оплаты в течение того же действия (см. §8 про
`won`) → авто-переход в `'closing'`, `closingTouchNumber: 0`.

Новые поля: `closingTouchNumber` (0-3), `nextTouchAt` (Timestamp).
Расписание: касание 1 — вечер того же дня (`trialDate` + до 21:00 того же
дня, если пробный утром/днём; если уже вечер — сразу), касание 2 — +1
день, касание 3 — +4 дня от касания 2 (итого «4-5 день» от пробного, как в
промпте). `nextTouchAt` пересчитывается после каждого «Отметить касание».

Карточка в `closing` — счётчик «Касание 2/3», дата следующего. Кнопка
«Отметить касание» в меню «⋮» — инкремент `closingTouchNumber`, пересчёт
`nextTouchAt`. При `closingTouchNumber === 3` кнопка меняется на «Отказ» с
предзаполненной причиной `undecided` (лид «думает») — по-прежнему ручное
подтверждение, не авто.

### 7. Отказ — фиксированный список причин + ремаркетинг

`DeclineLeadModal.jsx` — `Input` свободного текста заменяется на `Select` с
фиксированным списком (`lostReason`, новое поле, заменяет свободный
`statusReason` для лидов — `statusReason` остаётся как есть для остальных
случаев архивации студентов, не трогаем):

```
expensive | bad_timing | other_school | no_answer | no_show | undecided
```

Сохранение — как сейчас (`status:'archived', isArchived:true`), плюс
`funnelStage:'lost'`, `lostReason`, `lostAt: serverTimestamp()`.

Ремаркетинг: `lostReason` в `[no_answer, no_show]` и `lostAt` ≥ 30 дней
назад → лид «доступен для повторного маркетинга». Не отдельное поле
(вычисляется на чтении, как SLA-дедлайн в §3) — новая вкладка/фильтр в
списке архивных лидов на `StudentsPage.jsx` (там уже есть подобные
drill-down списки, например «Покинувшие» — тот же UI-паттерн).

### 8. Оплата → Won

Хук в `src/lib/billing.js`, `recordPayment()` — там уже есть проверка
`if (!student.firstPaymentAt)` (первый платёж студента). Расширяется: если
это первый платёж **и** `student.funnelStage` в `['trial_completed',
'closing']` — тем же `updateDoc`, что уже пишет `firstPaymentAt`,
добавляются `funnelStage:'won', paidAt: serverTimestamp(), paidAmount:
amount, groupId` (из переданного в `recordPayment` `groupId`). Никакой
новой точки входа — оплата уже проходит через этот единственный хелпер
отовсюду.

### 9. `stageHistory` — для отчёта

Новое поле `students/{id}.stageHistory: Array<{stage: string, enteredAt:
Date}>` — при каждом переходе `funnelStage` (ручном или авто из §1-8)
добавляется `{stage: newStage, enteredAt: new Date()}` (клиентское время —
та же причина, что и `callAttempts.at`: `serverTimestamp()` не работает
внутри элемента массива). Один общий хелпер `advanceStage(db, lead,
newStage, extraFields)` в `src/lib/leadFunnel.js` — все места, что меняют
`funnelStage` (моув по доске, авто-переходы, декline, оплата), проходят
через него, чтобы `stageHistory` никогда не забыли дописать.

### 10. Еженедельный отчёт по воронке

Новая секция на `/reports` (`src/pages/ReportsPage.jsx`): таблица по
операторам (`assignedOperator`) за выбранную неделю:

- новых лидов (created this week, count)
- % дозвона (доля лидов с ≥1 записью `stageHistory.stage === 'calling'`)
- % записи на пробный (доля с `stageHistory.stage === 'trial_scheduled'`)
- % явки (доля с `attended === true`)
- % оплаты после пробного (доля с `funnelStage === 'won'`)
- доля `no_answer`+`no_show` от всех `lost` (индикатор проблемы с номерами/
  каналом, не со скриптом/ценой — как явно указано в промпте)

Источник данных — `stageHistory` массивы лидов, `createdAt` в неделе,
группировка по `assignedOperator` клиентски (масштаб — сотни лидов в
месяц, без нужды в агрегатах на стороне сервера).

## Данные — сводка новых полей

`students/{id}`:
- `funnelStage: 'new'|'calling'|'trial_scheduled'|'trial_completed'|'closing'|'won'|'lost'`
- `assignedOperator: string` (uid)
- `trialDate: Timestamp | null`
- `trialTeacherId: string | null`
- `rescheduleCount: number` (default 0)
- `attended: boolean | null`
- `engagementScore: 'low'|'medium'|'high' | null`
- `closingTouchNumber: number` (default 0, только пока `funnelStage==='closing'`)
- `nextTouchAt: Timestamp | null`
- `lostReason: 'expensive'|'bad_timing'|'other_school'|'no_answer'|'no_show'|'undecided' | null`
- `lostAt: Timestamp | null`
- `paidAt: Timestamp | null`, `paidAmount: number | null`, `groupId: string | null` (на `won`)
- `stageHistory: Array<{stage: string, enteredAt: Date}>`

Удаляются: `leadStage`, `leadResult` (заменены `funnelStage`).

`settings/{branchId}`:
- `lastRoundRobinIndex: number` (default 0)

Права: всё продолжает жить под `isAdmin()` на `students`/`settings` — тот
же набор ролей уже пишет/читает эти документы. Изменений в
`firestore.rules` не требуется.

## Миграция существующих лидов

Одноразовый скрипт (как `import-old-attendance-jul-aug.mjs`, удаляется
после прогона) проставляет `funnelStage` всем существующим `status in
[lead, trial]`, не архивным:

- `status === 'lead'`, `callAttempts` пусто/отсутствует → `'new'`
- `status === 'lead'`, есть `callAttempts` → `'calling'`
- `status === 'trial'` → `'trial_scheduled'` (нет данных о `attended` в
  старой схеме — начинаем с этой стадии, дальше ведётся вручную)

`assignedOperator` бэкфиллится как `createdBy` (лучшее доступное
приближение — кто завёл, тот и вёл). Round-robin с этого момента только
для новых лидов.

## Не входит в эту итерацию

- Реальная отправка уведомлений (push/Telegram) — только визуальные
  индикаторы, как решено выше. Отдельная итерация, если понадобится
  Cloud Functions + Blaze-план + Telegram bot token.
- Приём лидов через Meta Lead Ads webhook — лиды по-прежнему создаются
  вручную через «Добавить лида»; `source` (уже существующее поле:
  instagram/telegram/friends/outdoor/other) продолжает служить заменой
  `source_campaign` из промпта — этого достаточно для текущего объёма,
  отдельного UTM-поля не заводим.
- Фильтр по оператору/источнику на доске — можно добавить поверх готовой
  доски отдельной итерацией, не было явного запроса приоритезировать
  сейчас.
