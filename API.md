# API приёма и выдачи лидов

Внешний API для интеграций (Google Sheets и другие системы), работающий
поверх Firestore напрямую — **не Cloud Functions** (проект на бесплатном
Firebase Spark-плане, без привязанной карты; см. `appsscript/README.md` за
причиной решения). Реализован как Google Apps Script Web App, а не как
роут в этом Vite-приложении — здесь backend'а нет вообще, весь фронтенд
пишет в Firestore напрямую с клиента.

Модель лида — не отдельная таблица, а документ коллекции `students` c
`funnelStage: 'new'` (см. `src/components/students/StudentFormModal.jsx`,
`src/lib/leadFunnel.js`). API создаёт/читает те же документы, лид сразу
появится на доске лидов в разделе «Новый лид».

## Прочитай перед подключением: отличия от «обычного» REST

Ограничения платформы Apps Script Web App, не моё архитектурное решение:

- **HTTP-статус транспорта всегда 200.** Реальный исход — в поле `status`
  внутри JSON-тела ответа (`200`/`201`/`400`/`401`/`403`/`404`/`429`), не в
  статус-коде ответа. Проверяй `status` в теле, не `response.status`.
- **Ключ передаётся не заголовком.** Apps Script не даёт читать
  `Authorization` в веб-хендлере. Ключ — поле `apiKey` в JSON-теле (POST)
  или query-параметр `?apiKey=` (GET).
- **Только GET и POST.** Обновление лида — `POST` с `{"action":"update", ...}`,
  не `PATCH /leads/:id`.

## Базовый URL

```
<WEB_APP_URL>
```

Подставь реальный URL после деплоя — см. `appsscript/README.md`, шаг 4
("Deploy → New deployment → Web app"). Выглядит как
`https://script.google.com/macros/s/AKfycb.../exec`.

## Аутентификация

Ключ создаётся так (см. `scripts/manage-api-keys.mjs`):

```
node --env-file=.env scripts/manage-api-keys.mjs create "Google Sheets" write
```

Выведет значение один раз:

```
id:    aB3xQ...
name:  Google Sheets
scope: write
key:   sk_live_ЗАМЕНИ_НА_СВОЙ
```

Больше нигде оно не хранится — только sha256-хэш в Firestore
(`apiKeys/{id}.hash`). Если потерял — создай новый (`create`), старый можно
отозвать:

```
node --env-file=.env scripts/manage-api-keys.mjs revoke aB3xQ...
node --env-file=.env scripts/manage-api-keys.mjs list
```

Scope: `read`, `write` (может и читать, и создавать/обновлять — write не
даёт read-only ключам чужих прав), `read-write` — то же самое явным
образом.

Rate limit: 60 запросов/мин на ключ (Apps Script `CacheService`, окно в
1 минуту). При превышении — `status: 429`.

## `POST <WEB_APP_URL>` — создать лида

Тело запроса:

```json
{
  "apiKey": "sk_live_...",
  "fullName": "Азиз Каримов",
  "phone": "998901234567",
  "phone2": "998907654321",
  "source": "instagram",
  "russianLevel": "Noldan boshlamoqchiman",
  "location": "Toshkent",
  "livesInTashkent": "Ha",
  "russianLearningReason": "Ish uchun kerak",
  "leadReceivedAt": "2026-08-14T08:10:00+05:00"
}
```

Поля лида — как в `StudentFormModal`: `fullName` (обязательно),
`phone`/`email` (нужен хотя бы один), `phone2` (опционально),
`source` — один из `instagram`/`telegram`/`friends`/`outdoor`/`other`.
Плюс поля под лиды из Google Sheets, хранятся как есть, без списка
допустимых значений, каждое независимо опционально: `russianLevel` (текст
ответа на "Rus tilida qanday darajadasiz?", прошлая таблица), `location`
(текст из "Joylashuvi", прошлая таблица), `livesInTashkent` (ответ на
"toshkentda_yashaysizmi?"), `russianLearningReason` (ответ на
"rus_tilini_nima_sababdan_o'rganmoqchisiz?"). Все показываются на карточке
лида под иконкой «i» (LeadCard → LeadInfoPopover), если заполнены.
`leadReceivedAt` (ISO-дата) — необязательный: если передан, именно он идёт
в `createdAt` лида (а не момент вызова API), чтобы SLA-дедлайны на доске
считались от реального времени прихода лида, а не от задержки скрипта в
Google Sheets.

Успех:

```json
{ "status": 201, "data": { "id": "aB3xQ1c...", "merged": false } }
```

Дубль (лид с этим телефоном уже создавался за последние 24ч) — существующая
запись обновляется, новая не плодится; ответ той же формы, но с `merged: true`
и `id` уже существующего лида:

```json
{ "status": 201, "data": { "id": "aB3xQ1c...", "merged": true } }
```

Ошибка валидации:

```json
{ "status": 400, "error": "Поле fullName обязательно." }
```

### curl

```bash
curl -X POST '<WEB_APP_URL>' \
  -H 'Content-Type: application/json' \
  -d '{
        "apiKey": "sk_live_ЗАМЕНИ_НА_СВОЙ",
        "fullName": "Азиз Каримов",
        "phone": "998901234567",
        "source": "instagram"
      }'
```

## `GET <WEB_APP_URL>?action=list` — список лидов

Параметры: `apiKey` (обязателен), `status` (=`funnelStage`, например `new`),
`source`, `created_after`, `created_before` (ISO-даты), `page` (по
умолчанию 1), `per_page` (по умолчанию 20, максимум 100).

```bash
curl -G '<WEB_APP_URL>' \
  --data-urlencode 'apiKey=sk_live_ЗАМЕНИ_НА_СВОЙ' \
  --data-urlencode 'action=list' \
  --data-urlencode 'status=new' \
  --data-urlencode 'per_page=50'
```

```json
{ "status": 200, "data": [ { "id": "...", "fullName": "...", "funnelStage": "new", ... } ], "page": 1, "per_page": 50, "total": 3 }
```

## `GET <WEB_APP_URL>?action=get&id=...` — один лид

```bash
curl -G '<WEB_APP_URL>' \
  --data-urlencode 'apiKey=sk_live_ЗАМЕНИ_НА_СВОЙ' \
  --data-urlencode 'action=get' \
  --data-urlencode 'id=aB3xQ1c...'
```

## `POST <WEB_APP_URL>` c `action: "update"` — обновить лида

```bash
curl -X POST '<WEB_APP_URL>' \
  -H 'Content-Type: application/json' \
  -d '{
        "apiKey": "sk_live_ЗАМЕНИ_НА_СВОЙ",
        "action": "update",
        "id": "aB3xQ1c...",
        "funnelStage": "calling"
      }'
```

## Проверка

```bash
node scripts/test-leads-api.mjs '<WEB_APP_URL>' 'sk_live_ЗАМЕНИ_НА_СВОЙ'
```

Проверяет: успешное создание, ошибку валидации, неверный ключ, дедуп
повторного лида, список с фильтром. Это не unit-тест — в проекте нет
тестового фреймворка ни во фронтенде (`package.json` без vitest/jest), ни в
Apps Script; скрипт бьёт по уже задеплоенному Web App URL как чёрный ящик.

## Изменённые/новые файлы

- `firestore.rules` — правила для новой коллекции `apiKeys` (admin-only).
- `firestore.indexes.json` — индексы для поиска дублей по телефону и
  выдачи списка лидов.
- `appsscript/Code.gs`, `appsscript/appsscript.json`, `appsscript/README.md`
  — сам Web App и инструкция по деплою (сервис-аккаунт, Script Properties).
- `appsscript/SheetsSync.gs` — опрос конкретной Google-таблицы и отправка
  новых строк в Web App (живёт в отдельном, привязанном к таблице проекте).
- `scripts/manage-api-keys.mjs` — создание/отзыв/список ключей.
- `scripts/test-leads-api.mjs` — дымовой тест задеплоенного API.
- `API.md` — этот файл.

## Известные ограничения

- Пагинация в `list` — offset-based поверх `runQuery` с `limit: 1000`, не
  рассчитана на десятки тысяч лидов (нормально для объёма одной школы).
- `assignRoundRobinOperator` в оригинале — Firestore-транзакция
  (`src/lib/leadFunnel.js`); в Apps Script упрощена до read-increment-write
  без транзакции — при одновременных запросах теоретически возможен гонки
  за индекс (не критично: максимум лид достанется не тому по очереди
  оператору, не потеряется).
- Я не могу выполнить/протестировать `appsscript/Code.gs` напрямую — нет
  среды выполнения Apps Script в моих инструментах. Код написан по
  задокументированному Google-паттерну self-signed JWT сервис-аккаунта, но
  первый реальный прогон — на тебе: задеплой и прогони
  `scripts/test-leads-api.mjs`.
