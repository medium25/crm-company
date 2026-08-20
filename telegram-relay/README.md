# Telegram-релей — общий эндпоинт для всех проектов

Отдельный standalone Google Apps Script Web App. Не привязан к CRM или её
Firebase-проекту — просто HTTP-эндпоинт, который принимает `{apiKey,
channel, text}` и шлёт сообщение в Telegram от имени одного бота. Любой
твой проект (эта CRM, другой Apps Script, Node-скрипт, cron, curl) может
слать сюда, зная только свой `apiKey` и имя канала — токен бота и
Telegram-ID групп/топиков видит только этот проект.

Код здесь хранится как источник правды и для code review; заливать в
script.google.com — вручную (или `clasp push`, если настроен).

## Разовая настройка

### 1. Бот

Если бота ещё нет — в Telegram напиши [@BotFather](https://t.me/BotFather)
→ `/newbot`, получишь токен вида `123456:AAH...`. Можно переиспользовать
бота, уже сделанного для CRM (`appsscript/README.md`) — один бот спокойно
шлёт в разные группы/топики, ничего заводить заново не обязательно.

### 2. Новый проект Apps Script

1. [script.google.com](https://script.google.com) → New project.
2. Вставь содержимое `Code.gs` из этой папки.
3. Project Settings → "Show appsscript.json manifest file in editor" →
   замени содержимое на `appsscript.json` из этой папки.

### 3. Script Properties

Project Settings → Script Properties:

| Property             | Значение                          |
|-----------------------|-------------------------------------|
| `TELEGRAM_BOT_TOKEN`   | токен бота                          |
| `API_KEYS`             | можно оставить пустым — заполнится через `addApiKey(...)` ниже |
| `CHANNELS`             | можно оставить пустым — заполнится через `setChannel(...)` ниже |

### 4. Деплой как Web App

Deploy → New deployment → тип **Web app**:
- Execute as: **Me**.
- Who has access: **Anyone**.

Скопируй URL вида `https://script.google.com/macros/s/AKfycb.../exec` —
это и есть адрес релея, на него шлют POST все проекты.

**После любого изменения кода — Deploy → Manage deployments → карандаш у
существующего деплоя → New version, иначе изменения не применятся к уже
выданному URL.**

### 5. Заведи канал(ы)

В редакторе — выпадающий список функций сверху → `setChannel` → перед
запуском впиши в скобках нужные значения (Run не принимает аргументы из
UI, только через код), например:

```js
setChannel('reports', '-1001234567890', 12);
```

Как узнать `chatId`/`threadId` топика — то же самое, что для CRM:
1. Добавь бота в группу с включёнными темами (Group settings → Topics).
2. Напиши сообщение в нужный топик.
3. Открой `https://api.telegram.org/bot<TOKEN>/getUpdates` в браузере —
   в JSON найди `chat.id` (отрицательное число) и `message_thread_id`.

`listChannels()` — посмотреть, что уже заведено. `removeChannel(name)` —
убрать канал.

### 6. Выдай ключ каждому проекту-отправителю

```js
addApiKey('crm-daily-reports');   // напечатает ключ в Execution log — сохрани сразу
addApiKey('another-project');
```

Ключ виден только один раз, в момент создания — второй раз посмотреть
нельзя, только `revokeApiKey(key)` и выпустить новый. `listApiKeys()`
показывает только ИМЕНА проектов, не сами ключи (по замыслу).

### 7. Проверка

`testSend()` из редактора — шлёт тестовое сообщение в первый заведённый
канал, минуя HTTP-слой и apiKey (проверяет только токен бота и chatId).

## Как слать сообщение из другого проекта

```
POST https://script.google.com/macros/s/AKfycb.../exec
Content-Type: application/json

{
  "apiKey": "relay_...",
  "channel": "reports",
  "text": "<b>Привет</b> из другого проекта"
}
```

Поля:
- `apiKey`, `text` — обязательные.
- `channel` — имя из `setChannel(...)`, предпочтительно (не палит
  Telegram-ID вызывающему).
- `chatId`/`threadId` — сырой вариант вместо `channel`, если канал ещё не
  заводили.
- `parseMode` — `'HTML'` (по умолчанию), `'MarkdownV2'` или `''` (без
  форматирования).
- `silent` — `true` — сообщение без звука уведомления.

Ответ — всегда HTTP 200 (ограничение платформы, см. ниже), реальный исход
в теле: `{"status": 200, "data": {"sent": true}}` или `{"status": 4xx,
"error": "..."}`.

Пример из Node (как в `appsscript/scripts/*.mjs` этого репозитория):

```js
await fetch('https://script.google.com/macros/s/AKfycb.../exec', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ apiKey: 'relay_...', channel: 'reports', text: 'Готово ✅' }),
});
```

## Ограничения этой платформы

- **HTTP-статус всегда 200** — Apps Script Web App не даёт вернуть
  настоящий 400/401/429 на транспортном уровне, смотри поле `status`
  внутри JSON-тела.
- **Заголовок `Authorization` недоступен** — ключ передаётся полем
  `apiKey` в JSON-теле, не заголовком.
- Ключи и каналы живут в Script Properties как JSON — для пары проектов
  этого достаточно; если счёт пойдёт на десятки, можно перенести в
  отдельную Firestore-коллекцию (не сделано сейчас намеренно — этот релей
  специально без Firebase-зависимости).
- Я не могу выполнить/протестировать этот код напрямую — после деплоя
  прогони `testSend()` и один реальный POST-запрос, проверь глазами.
