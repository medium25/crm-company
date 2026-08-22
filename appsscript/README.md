# Приём/выдача лидов — Apps Script Web App

Код в этой папке — не часть сборки Vite, он живёт отдельно, в **двух
разных** проектах Google Apps Script:

- `Code.gs` + `appsscript.json` — сам API (Web App), standalone-проект.
- `SheetsSync.gs` — синхронизация из конкретной Google-таблицы, живёт
  container-bound скриптом ВНУТРИ той таблицы (Extensions → Apps Script из
  самой таблицы), не в standalone-проекте выше. Обращается к Web App как
  обычный внешний клиент — тот же apiKey, что и у любой другой интеграции.

Файлы здесь хранятся как источник правды и для code review; заливать их в
script.google.com нужно вручную (или через `clasp push`, если он у тебя
настроен).

## Почему не Cloud Functions

Проект на бесплатном Firebase Spark-плане, Cloud Functions требуют платный
Blaze (см. `scripts/seed.js` и `docs/superpowers/specs/2026-08-13-leads-funnel-redesign.md`).
Вместо этого API живёт как Google Apps Script Web App (бесплатно, без
привязки карты) и пишет в тот же Firestore напрямую через его REST API,
используя сервис-аккаунт.

## Разовая настройка

### 1. Сервис-аккаунт с доступом к Firestore

В [Google Cloud Console](https://console.cloud.google.com/) → выбери проект
`crm-company-81ddd` (тот же `VITE_FB_PROJECT_ID`, что в `.env`):

1. IAM & Admin → Service Accounts → Create Service Account.
   Имя, например, `leads-api`.
2. Роль — **Cloud Datastore User** (`roles/datastore.user`) — минимально
   достаточно для чтения/записи Firestore, лишнего не даёт.
3. Keys → Add Key → Create new key → JSON. Скачается файл — в нём
   `client_email` и `private_key`, они понадобятся на шаге 3.

### 2. Новый проект Apps Script

1. [script.google.com](https://script.google.com) → New project.
2. Вставь содержимое `Code.gs` из этой папки в `Code.gs` проекта.
3. Project Settings (шестерёнка слева) → включи "Show appsscript.json
   manifest file in editor" → замени содержимое `appsscript.json` на файл
   из этой папки.

### 3. Script Properties

Project Settings → Script Properties → Add script property:

| Property                     | Значение                                             |
|-------------------------------|-------------------------------------------------------|
| `FIRESTORE_PROJECT_ID`        | `crm-company-81ddd`                                    |
| `SERVICE_ACCOUNT_EMAIL`       | `client_email` из скачанного JSON-ключа               |
| `SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` из JSON-ключа, целиком, вместе со строками `-----BEGIN PRIVATE KEY-----`/`-----END PRIVATE KEY-----` |
| `DEFAULT_BRANCH_ID`           | `icon-main` (можно не задавать — это значение по умолчанию) |

### 4. Деплой как Web App

Deploy → New deployment → тип **Web app**:
- Execute as: **Me** (владелец скрипта — так сервис-аккаунт используется
  через код, а не через личность вызывающего).
- Who has access: **Anyone**.

Скопируй выданный URL вида
`https://script.google.com/macros/s/AKfycb.../exec` — это и есть базовый
URL API, подставь его в `API.md` и в Apps Script (Google Sheets), который
будет слать туда лиды.

### 5. Ключ для интеграции

С машины, где настроен `.env` этого репозитория:

```
node --env-file=.env scripts/manage-api-keys.mjs create "Google Sheets" write
```

Выведенное значение `key` (`sk_live_...`) — вставь в Apps Script со стороны
Google Sheets как параметр `apiKey`. См. `API.md` за примерами запросов.

## Ежедневный отчёт по операторам → Telegram

Живёт в том же `Code.gs` (тот же standalone-проект, тот же сервис-аккаунт —
отдельный проект под это не нужен). Раз в 5 минут проверяет по каждому
активному оператору, не настал ли момент слать ЕМУ отчёт (10 минут до конца
ЕГО смены на сегодня, из `settings/{branchId}.operatorSchedules`), и если
да — считает 6 метрик за 24 часа перед этим моментом и шлёт сообщение в
топик «Отчёты» Telegram-группы. Оператора без активности за окно (все
метрики — 0) пропускает молча.

### 1. Бот и группа

1. В Telegram напиши [@BotFather](https://t.me/BotFather) → `/newbot`,
   следуй подсказкам — получишь токен вида `123456:AAH...`.
2. Добавь бота в нужную группу (группа должна быть с включёнными темами/
   топиками — «Group settings → Topics»).
3. Узнай `chat_id` группы и `message_thread_id` топика «Отчёты»:
   - Напиши любое сообщение в топик «Отчёты» от своего аккаунта.
   - Открой в браузере `https://api.telegram.org/bot<TOKEN>/getUpdates`
     (подставь свой токен) — в ответе JSON найди `chat.id` (отрицательное
     число для групп) и `message_thread_id` у своего сообщения.

### 2. Script Properties (добавь к таблице из шага 3 выше)

| Property                     | Значение                                    |
|-------------------------------|----------------------------------------------|
| `TELEGRAM_BOT_TOKEN`          | токен от BotFather                            |
| `TELEGRAM_CHAT_ID`            | `chat_id` группы (со знаком минус)            |
| `TELEGRAM_REPORTS_THREAD_ID`  | `message_thread_id` топика «Отчёты»           |

### 3. Установка триггера (один раз)

В редакторе script.google.com — выпадающий список функций сверху → выбери
`installDailyOperatorReportTrigger` → **Run**. Безопасно перезапускать
(сносит старый триггер с тем же именем перед созданием нового).

### 4. Проверка перед тем, как доверять графику

Выбери `previewDailyOperatorReports` → **Run** → открой Execution log
(Ctrl+Enter). Посчитает отчёт по каждому оператору за последние 24 часа
ПРЯМО СЕЙЧАС (без привязки к графику) и просто напечатает — ничего не
отправляет в Telegram. Проверь, что цифры похожи на правду, прежде чем
полагаться на реальный триггер.

### Если что-то не так

- **Отчёт не приходит** — проверь, что у оператора вообще задан график на
  сегодняшний день недели в Настройки → Распределение лидов, и что он был
  активен за окно (иначе отчёт по нему намеренно не шлётся).
- **Приходит не в тот топик / не в ту группу** — перепроверь `chat_id`/
  `message_thread_id` через `getUpdates`, как в шаге 1.
- Логи каждого тика триггера — Executions (иконка часов слева в редакторе).

## Редактирование текста отчёта прямо из Telegram

Текст отчёта — шаблон с плейсхолдерами (`{{name}}`, `{{periodStart}}`,
`{{periodEnd}}`, `{{leads}}`, `{{taken}}`, `{{lost}}`, `{{target}}`,
`{{other}}`, `{{payments}}`), хранится в Script Property `REPORT_TEMPLATE`.
Меняется командами боту в Telegram — без правки кода. По умолчанию —
редактировать может кто угодно, кто напишет боту (осознанно открыто).
Ограничить одним человеком — задать `ADMIN_TELEGRAM_USER_ID`, тогда команды
сработают только от него.

### Разовая настройка

1. Выбери `installTelegramWebhook` в списке функций → **Run** — один раз.
   Сгенерирует секрет (`TELEGRAM_WEBHOOK_SECRET`) сам и подключит webhook
   к этому Web App. Безопасно перезапускать.
2. Напиши боту `/gettemplate` (в личку или в ту же группу) — должен
   ответить текущим шаблоном и подсказкой по плейсхолдерам.
3. (Опционально, чтобы закрыть только собой) Узнай свой Telegram `user_id` —
   `getUpdates`, поле `message.from.id` у твоего сообщения → добавь
   `ADMIN_TELEGRAM_USER_ID` в Script Properties.

### Команды (админ, либо кто угодно — см. выше)

- `/gettemplate` — прислать текущий шаблон текстом (готовым для копирования
  и правки).
- `/settemplate` и с новой строки — новый текст целиком (эмодзи, порядок
  строк, формулировки — что угодно, плейсхолдеры сохрани нужные).
- `/resettemplate` — вернуть шаблон по умолчанию.

### Если команды не отвечают

- Проверь `ADMIN_TELEGRAM_USER_ID` — сверка строгая по `from.id`.
- `installTelegramWebhook` нужно перезапустить после смены URL деплоя
  (Deploy → Manage deployments → новая версия меняет `/exec` URL только
  если создан НОВЫЙ deployment, не при New version — но проверить лишним
  не будет).
- Логи webhook-запросов — тоже в Executions, ищи `doPost`.

## Ограничения этой платформы (важно прочитать)

- **HTTP-статус всегда 200.** Apps Script Web App не даёт вернуть настоящий
  400/401/429 на транспортном уровне — единственный способ узнать исход
  запроса это поле `status` внутри JSON-тела ответа.
- **Заголовок `Authorization` недоступен.** Apps Script не прокидывает
  произвольные заголовки в `doGet(e)`/`doPost(e)`. Ключ передаётся полем
  `apiKey` в теле (POST) или query-параметром `?apiKey=` (GET).
- **PATCH не поддерживается как метод** — Web App принимает только GET/POST.
  Обновление лида — это `POST` с `{"action": "update", ...}`.
- Я не могу выполнить/протестировать этот код напрямую (нет среды
  выполнения Apps Script у меня под рукой) — после деплоя прогони
  `scripts/test-leads-api.mjs` (см. корень репозитория) и проверь глазами.
