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
