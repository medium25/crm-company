/**
 * Универсальный релей «любые данные из любого проекта → Telegram». Не
 * привязан к этой CRM или её Firebase-проекту — отдельный standalone Apps
 * Script Web App, работает как чистый HTTP-эндпоинт. Любой проект (другой
 * Apps Script, Node-скрипт, cron, вообще curl) шлёт сюда POST с текстом и
 * именем канала — релей находит chat_id/thread_id канала и отправляет от
 * имени бота. Токен бота и Telegram-ID каналов остаются только здесь —
 * вызывающий проект их никогда не видит, только свой apiKey и имя канала.
 *
 * ВАЖНО про транспорт (та же особенность Apps Script Web App, что и у
 * appsscript/Code.gs в этом репозитории): HTTP-статус ответа всегда 200,
 * если выполнение не упало необработанным исключением — реальный исход
 * смотри в поле `status` внутри JSON-тела, не в транспортном коде.
 * Заголовок Authorization недоступен — ключ передаётся полем `apiKey` в
 * теле запроса.
 *
 * Настройка — см. README.md рядом с этим файлом.
 *
 * Script Properties:
 *   TELEGRAM_BOT_TOKEN   токен бота от @BotFather
 *   API_KEYS             JSON {"<key>": "<имя проекта>", ...}
 *   CHANNELS             JSON {"<имя канала>": {"chatId": "...", "threadId": 12}, ...}
 */

const RELAY_RATE_LIMIT_PER_MINUTE = 30;

function props_() {
  return PropertiesService.getScriptProperties();
}

function readJsonProp_(name) {
  const raw = props_().getProperty(name);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Script Property "${name}" содержит невалидный JSON.`);
  }
}

function writeJsonProp_(name, obj) {
  props_().setProperty(name, JSON.stringify(obj, null, 2));
}

function apiError_(status, message) {
  const err = new Error(message);
  err.apiStatus = status;
  return err;
}

// --- Ключи проектов ---------------------------------------------------

/**
 * Разовая/по мере надобности настройка — запусти вручную из редактора
 * (выбери addApiKey в списке функций → перед запуском поменяй PROJECT_NAME
 * ниже на реальное имя, или вызови из другой функции с нужным именем).
 * Ключ печатается в Execution log РОВНО ОДИН РАЗ — сохрани его сразу,
 * второй раз посмотреть нельзя (только перевыпустить новый).
 * @param {string} projectName человекочитаемое имя — для аудита, чей это ключ
 * @returns {string} сам ключ
 */
function addApiKey(projectName) {
  if (!projectName) throw new Error('Укажи имя проекта: addApiKey("моё-имя-проекта")');
  const keys = readJsonProp_('API_KEYS');
  const key = 'relay_' + Utilities.getUuid().replace(/-/g, '');
  keys[key] = projectName;
  writeJsonProp_('API_KEYS', keys);
  Logger.log(`Новый ключ для "${projectName}": ${key}`);
  Logger.log('Сохрани его сейчас — второй раз не покажу, только листингом имён.');
  return key;
}

/** Отзывает ключ — вызывающий с ним проект больше не сможет слать сообщения. */
function revokeApiKey(key) {
  const keys = readJsonProp_('API_KEYS');
  if (!(key in keys)) {
    Logger.log(`Ключ не найден (уже отозван?).`);
    return;
  }
  const name = keys[key];
  delete keys[key];
  writeJsonProp_('API_KEYS', keys);
  Logger.log(`Ключ "${name}" отозван.`);
}

/** Список имён проектов с ключами (не сами ключи — их не восстановить, только отозвать/перевыпустить). */
function listApiKeys() {
  const keys = readJsonProp_('API_KEYS');
  const names = Object.values(keys);
  Logger.log(names.length ? names.join('\n') : '(ключей нет)');
}

function authenticateApiKey_(rawKey) {
  if (!rawKey) throw apiError_(401, 'Не передан apiKey.');
  const keys = readJsonProp_('API_KEYS');
  const projectName = keys[rawKey];
  if (!projectName) throw apiError_(401, 'Неверный или отозванный apiKey.');

  const cache = CacheService.getScriptCache();
  const bucket = `rate:${rawKey}:${Math.floor(Date.now() / 60000)}`;
  const count = Number(cache.get(bucket) || '0') + 1;
  cache.put(bucket, String(count), 70);
  if (count > RELAY_RATE_LIMIT_PER_MINUTE) {
    throw apiError_(429, `Превышен лимит ${RELAY_RATE_LIMIT_PER_MINUTE} запросов/мин для этого ключа.`);
  }

  return projectName;
}

// --- Каналы (именованные назначения) ------------------------------------

/**
 * Заводит/обновляет именованный канал — chat_id и (опционально) thread_id
 * топика прячутся за именем, вызывающие проекты передают только его.
 * Запусти вручную из редактора с реальными значениями, например:
 *   setChannel('reports', '-1001234567890', 12)
 * @param {string} name
 * @param {string} chatId
 * @param {number} [threadId]
 */
function setChannel(name, chatId, threadId) {
  if (!name || !chatId) throw new Error('Нужны name и chatId: setChannel("reports", "-100...", 12)');
  const channels = readJsonProp_('CHANNELS');
  channels[name] = { chatId: String(chatId), threadId: threadId || null };
  writeJsonProp_('CHANNELS', channels);
  Logger.log(`Канал "${name}" → chatId=${chatId}${threadId ? `, threadId=${threadId}` : ''}`);
}

function removeChannel(name) {
  const channels = readJsonProp_('CHANNELS');
  if (!(name in channels)) {
    Logger.log('Канал не найден.');
    return;
  }
  delete channels[name];
  writeJsonProp_('CHANNELS', channels);
  Logger.log(`Канал "${name}" удалён.`);
}

function listChannels() {
  const channels = readJsonProp_('CHANNELS');
  Logger.log(JSON.stringify(channels, null, 2));
}

// --- Отправка в Telegram --------------------------------------------------

function telegramSendMessage_(chatId, threadId, text, parseMode, disableNotification) {
  const token = props_().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw apiError_(500, 'TELEGRAM_BOT_TOKEN не задан в Script Properties.');

  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode || 'HTML',
  };
  if (threadId) payload.message_thread_id = Number(threadId);
  if (disableNotification) payload.disable_notification = true;

  const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = resp.getResponseCode();
  if (code >= 400) {
    throw apiError_(502, `Telegram ответил ${code}: ${resp.getContentText()}`);
  }
}

/**
 * Тело запроса:
 *   apiKey        обязательно
 *   text          обязательно
 *   channel       имя канала из setChannel(...) — предпочтительно
 *   chatId        альтернатива channel — сырой chat_id (если канал не заведён)
 *   threadId      с chatId, опционально
 *   parseMode     опционально, по умолчанию 'HTML' ('HTML'|'MarkdownV2'|'')
 *   silent        опционально, true — без звука уведомления
 */
function handleSend_(body) {
  const projectName = authenticateApiKey_(body.apiKey);
  if (!body.text) throw apiError_(400, 'Поле text обязательно.');

  let chatId = body.chatId;
  let threadId = body.threadId;
  if (body.channel) {
    const channels = readJsonProp_('CHANNELS');
    const channel = channels[body.channel];
    if (!channel) throw apiError_(400, `Канал "${body.channel}" не заведён (см. setChannel в редакторе).`);
    chatId = channel.chatId;
    threadId = channel.threadId;
  }
  if (!chatId) throw apiError_(400, 'Нужен channel или chatId.');

  telegramSendMessage_(chatId, threadId, body.text, body.parseMode, body.silent);
  Logger.log(`[relay] "${projectName}" → ${body.channel || chatId}: ${body.text.slice(0, 80)}`);
  return { sent: true };
}

// --- HTTP entry point -------------------------------------------------------

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch {
      throw apiError_(400, 'Тело запроса должно быть валидным JSON.');
    }
    const data = handleSend_(body);
    return jsonOutput_({ status: 200, data });
  } catch (err) {
    const status = err.apiStatus || 500;
    return jsonOutput_({ status, error: err.message || String(err) });
  }
}

/** Смотри README — без параметров просто говорит, что эндпоинт жив и принимает только POST. */
function doGet() {
  return jsonOutput_({ status: 200, data: { ok: true, hint: 'POST { apiKey, channel|chatId, text }' } });
}

/**
 * Ручная проверка — поменяй канал/текст ниже под себя и Run из редактора.
 * Не идёт через doPost/apiKey (вызывается изнутри проекта), просто дёргает
 * ту же telegramSendMessage_, что и реальные запросы.
 */
function testSend() {
  const channels = readJsonProp_('CHANNELS');
  const firstName = Object.keys(channels)[0];
  if (!firstName) {
    Logger.log('Нет ни одного канала — сначала setChannel(...).');
    return;
  }
  const channel = channels[firstName];
  telegramSendMessage_(channel.chatId, channel.threadId, `Тестовое сообщение от Telegram-релея (канал «${firstName}»).`, 'HTML', false);
  Logger.log(`Отправлено в "${firstName}".`);
}
