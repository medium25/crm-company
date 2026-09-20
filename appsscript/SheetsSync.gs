/**
 * Синхронизация лидов из Google Sheets в CRM. Живёт в ОТДЕЛЬНОМ Apps Script
 * проекте — не в том же, что appsscript/Code.gs (leads-api), а привязанном
 * к самой таблице (Extensions → Apps Script из таблицы, container-bound
 * script). Ходит в уже задеплоенный Web App leads-api как обычный внешний
 * клиент, через тот же apiKey, что и любая другая интеграция.
 *
 * Почему таймер, а не onFormSubmit/onEdit: обе строки таблицы приходят
 * из внешнего бота/интеграции, не через саму форму Google и не через ручной
 * ввод в UI — оба триггера в таком случае часто не срабатывают (onEdit не
 * фиксирует правки, сделанные через Sheets API; onFormSubmit требует, чтобы
 * лист был реально привязан к Google-форме). Опрос по таймеру срабатывает
 * всегда, независимо от способа, которым строка появилась.
 *
 * Один запуск обрабатывает НЕСКОЛЬКО листов одной таблицы (SHEET_NAMES) —
 * у всех листов должны быть одинаковые заголовки колонок (один FIELD_HEADERS
 * на все). Если структура колонок отличается между листами — этот файл не
 * подходит, нужен свой FIELD_HEADERS на лист (не реализовано, не было нужно).
 * Кроме отдельных полей (fullName/phone/...), КАЖДАЯ колонка строки целиком
 * дублируется на лида в rawColumns — карточка хранит форму как есть, даже
 * то, что CRM сама не использует (ad_id/campaign_name/lead_status и т.п.),
 * чтобы потом можно было сверять/заполнять другую таблицу по любому полю.
 *
 * Настройка:
 *   1. В таблице: Extensions → Apps Script.
 *   2. Вставь этот файл как Code.gs (или отдельным .gs-файлом в этом проекте).
 *   3. Project Settings → Script Properties:
 *        LEADS_API_URL   — Web App URL из appsscript/Code.gs (см. API.md)
 *        LEADS_API_KEY   — ключ с scope write (scripts/manage-api-keys.mjs)
 *        SHEET_NAMES     — имена листов с лидами через запятую, например
 *                           "Meta 1, Meta 2, Meta 3". Не задан — берётся
 *                           SHEET_NAME (один лист, для обратной
 *                           совместимости), а если и его нет — активный лист.
 *        SPREADSHEET_ID  — id ДРУГОЙ таблицы (из её URL), если синк должен
 *                           читать не ту таблицу, к которой скрипт
 *                           привязан. Не задан — используется таблица-
 *                           контейнер (обычный случай).
 *        START_ROW       — номер строки листа, с которой начинать (1 =
 *                           заголовки, 2 = первая строка данных); всё
 *                           раньше игнорируется молча. Общий для всех
 *                           листов. Не задан — обрабатываются все строки.
 *   4. Выбери testSyncOneRow в выпадающем списке функций → Run — проверит
 *      первую несинхронизированную строку первого листа из SHEET_NAMES и
 *      покажет результат в Execution log, не трогая остальные строки и не
 *      ставя триггер.
 *   5. Когда testSyncOneRow отработал без ошибок — запусти installTrigger
 *      один раз (тоже через Run) — поставит опрос каждую минуту.
 */

// Соответствие: ключ — как называется поле в API (см. API.md), значение —
// список возможных заголовков колонки в таблице (первый найденный
// выигрывает) — разные формы/кампании в ОДНОЙ таблице подписывают одно и
// то же поле по-разному (напр. "ismingiz:" на узбекском и "полное_имя" на
// русском для имени), это не опечатка и не два разных поля. Один и тот же
// FIELD_HEADERS применяется ко ВСЕМ листам из SHEET_NAMES.
const FIELD_HEADERS = {
  fullName: ['ismingiz:', 'полное_имя'],
  phone: ["bog'lanish_uchun_raqam_qoldiring:", 'номер_телефона'],
  leadReceivedAt: ['created_time'],
  livesInTashkent: ['toshkentda_yashaysizmi?'],
  russianLearningReason: ["rus_tilini_nima_sababdan_o'rganmoqchisiz?"],
};

const SYNCED_AT_HEADER = 'CRM synced';
const SYNCED_ID_HEADER = 'CRM lead id';
const SYNCED_ERROR_HEADER = 'CRM error';
const MAX_ROWS_PER_RUN = 10; // общий бюджет на ВСЕ листы за один тик (было 25) — не бьём rate limit (60/мин на ключ) и суточную квоту UrlFetch
const RUN_TIME_BUDGET_MS = 4 * 60 * 1000; // проход сам останавливается заранее (лимит Apps Script — 6 минут)

// --- Повторы упавших строк ---------------------------------------------------
// Раньше строка, которую не удалось отправить, оставалась «несинхронизированной» и
// её брал следующий тик — снова и снова, без пауз и без предела. При исчерпанной
// квоте UrlFetch это давало бесконечный цикл: 25 строк × ~7 с на каждой минуте, и
// каждая попытка тратила ещё запросы после сброса квоты. Теперь:
//  • ошибка квоты («Service invoked too many times…», 429) останавливает ВЕСЬ проход
//    и ставит паузу (QUOTA_BLOCKED_UNTIL) — строки не трогаются, попытки не тратятся;
//  • обычная ошибка строки пишется в «CRM error» как «ERR#n <время> <текст>» и
//    повторяется с нарастающей паузой (RETRY_BACKOFF_MIN), максимум MAX_ATTEMPTS раз;
//  • после этого строка помечается «СТОП# …» и больше не берётся, пока не очистить
//    ячейку «CRM error» вручную (или запустить retryFailedRows).
const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MIN = [5, 15, 60, 180]; // пауза после 1-й, 2-й, 3-й, 4-й неудачи
const ERR_PREFIX = 'ERR#';
const GAVE_UP_PREFIX = 'СТОП#';
const NO_CONTACT_ERROR = 'Нет имени или телефона — пропущена';
const QUOTA_BLOCK_KEY = 'QUOTA_BLOCKED_UNTIL';

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Таблица-источник — контейнер по умолчанию, либо SPREADSHEET_ID, если задан. */
function getSpreadsheet_() {
  const id = props_().getProperty('SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

/** Список имён листов для синка — SHEET_NAMES (через запятую) → SHEET_NAME → активный лист. */
function getSheetNames_(ss) {
  const multi = props_().getProperty('SHEET_NAMES');
  if (multi) {
    const names = multi.split(',').map((s) => s.trim()).filter(Boolean);
    if (names.length) return names;
  }
  const single = props_().getProperty('SHEET_NAME');
  if (single) return [single];
  return [ss.getActiveSheet().getName()];
}

/** Находит/создаёт служебные колонки (CRM synced/lead id/error), если их ещё нет. */
function ensureTrackingColumns_(sheet, headers) {
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));
  let nextCol = headers.length;
  [SYNCED_AT_HEADER, SYNCED_ID_HEADER, SYNCED_ERROR_HEADER].forEach((header) => {
    if (idx[header] === undefined) {
      sheet.getRange(1, nextCol + 1).setValue(header);
      idx[header] = nextCol;
      nextCol += 1;
    }
  });
  return idx;
}

function toIsoDate_(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return isNaN(parsed) ? null : parsed.toISOString();
}

/** Первое непустое значение среди возможных заголовков поля (см. FIELD_HEADERS). */
function getField_(row, idx, apiField) {
  for (const header of FIELD_HEADERS[apiField]) {
    const col = idx[header];
    if (col !== undefined && row[col] !== '' && row[col] != null) return row[col];
  }
  return null;
}

/**
 * Дамп ВСЕХ колонок строки как есть (кроме служебных CRM synced/lead id/
 * error) — идёт в rawColumns на лиде, чтобы потом сверять/заполнять другую
 * таблицу (кто оплатил/отказался) по любому полю формы (ad_id, campaign_name,
 * form_name, lead_status и т.п.), даже тем, что CRM сама не использует.
 */
function dumpRow_(row, headers, trackingCols) {
  const out = {};
  headers.forEach((header, i) => {
    if (trackingCols.has(i) || !header) return;
    const value = row[i];
    out[header] = value instanceof Date ? value.toISOString() : value === '' ? null : value;
  });
  return out;
}

function buildPayload_(row, idx, headers, trackingCols) {
  return {
    fullName: (getField_(row, idx, 'fullName') || '').toString().trim(),
    phone: (getField_(row, idx, 'phone') || '').toString().trim(),
    leadReceivedAt: toIsoDate_(getField_(row, idx, 'leadReceivedAt')) || undefined,
    livesInTashkent: (getField_(row, idx, 'livesInTashkent') || '').toString().trim() || undefined,
    russianLearningReason: (getField_(row, idx, 'russianLearningReason') || '').toString().trim() || undefined,
    rawColumns: dumpRow_(row, headers, trackingCols),
    source: 'meta_target', // из этих таблиц приходят все с таргета в Meta
  };
}

function sendLead_(payload) {
  const apiUrl = props_().getProperty('LEADS_API_URL');
  const apiKey = props_().getProperty('LEADS_API_KEY');
  if (!apiUrl || !apiKey) throw new Error('LEADS_API_URL/LEADS_API_KEY не заданы в Script Properties.');

  const url = `${apiUrl}?${encodeURIComponent('apiKey')}=${encodeURIComponent(apiKey)}`;
  const resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ ...payload, apiKey }),
    muteHttpExceptions: true,
  });
  const json = JSON.parse(resp.getContentText());
  if (json.status >= 400) throw new Error(json.error || `API вернул статус ${json.status}`);
  return json.data;
}

/** Ошибка исчерпанной квоты/лимита (а не «плохая строка»): её повтор ничего не даст, пока квота не сбросится. */
function isQuotaError_(message) {
  return /Service invoked too many times|too many times for one day|Quota exceeded|Превышен лимит|\b429\b/i.test(String(message));
}

/** Мс до полуночи по Тихому океану — тогда сбрасываются суточные квоты Apps Script (12:00 по Ташкенту). */
function msUntilPacificMidnight_() {
  const parts = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'H:m:s').split(':').map(Number);
  return (86400 - (parts[0] * 3600 + parts[1] * 60 + parts[2])) * 1000;
}

/** Ставит паузу всему синку: суточная квота — до сброса (+2 мин), прочий лимит — на 15 минут. */
function blockSync_(message) {
  const daily = /one day|за сутки|суточн/i.test(String(message));
  const until = Date.now() + (daily ? msUntilPacificMidnight_() + 2 * 60000 : 15 * 60000);
  props_().setProperty(QUOTA_BLOCK_KEY, String(until));
  Logger.log('Пауза синка до ' + new Date(until).toISOString() + ' (' + (daily ? 'суточная квота' : 'лимит запросов') + '): ' + message);
}

/** Пауза синка, если она ещё идёт (мс до конца), иначе 0. */
function syncBlockedForMs_() {
  const until = Number(props_().getProperty(QUOTA_BLOCK_KEY) || 0);
  return until > Date.now() ? until - Date.now() : 0;
}

/** «ERR#3 2026-09-20T07:01:00.000Z текст» → {attempts, at}; старый/чужой текст ошибки → {attempts: 1, at: 0} (можно повторить сразу). */
function parseErrorCell_(text) {
  const m = new RegExp('^' + ERR_PREFIX + '(\\d+) (\\S+)').exec(String(text || ''));
  if (!m) return { attempts: 1, at: 0 };
  return { attempts: Number(m[1]), at: new Date(m[2]).getTime() || 0 };
}

/** Брать ли строку с такой ячейкой «CRM error» сейчас. */
function shouldAttemptRow_(errorText, nowMs) {
  const text = String(errorText || '');
  if (!text || text === 'merged') return true;
  if (text.indexOf(GAVE_UP_PREFIX) === 0) return false;
  if (text === NO_CONTACT_ERROR) return false; // чинится только правкой самой строки — очисти ячейку после правки
  const { attempts, at } = parseErrorCell_(text);
  if (attempts >= MAX_ATTEMPTS) return false;
  const waitMin = RETRY_BACKOFF_MIN[Math.min(attempts, RETRY_BACKOFF_MIN.length) - 1];
  return nowMs >= at + waitMin * 60000;
}

/** Новый текст ячейки после неудачи: ERR#n… или, на последней попытке, СТОП#… */
function failureCellText_(errorText, message, nowMs) {
  const prev = parseErrorCell_(errorText);
  const attempts = String(errorText || '').indexOf(ERR_PREFIX) === 0 ? prev.attempts + 1 : 1;
  const stamp = new Date(nowMs).toISOString();
  if (attempts >= MAX_ATTEMPTS) return GAVE_UP_PREFIX + attempts + ' ' + stamp + ' ' + message + ' (очисти ячейку, чтобы повторить)';
  return ERR_PREFIX + attempts + ' ' + stamp + ' ' + message;
}

/**
 * Синкает один лист, обрабатывая не больше budget строк. Возвращает
 * фактически обработанное количество (списывается с общего бюджета в
 * syncNewLeadsToCrm_, чтобы три листа вместе не превысили MAX_ROWS_PER_RUN
 * за один тик).
 */
function syncSheet_(sheet, budget, deadlineMs) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return { processed: 0, stop: false };

  const headers = data[0];
  const idx = ensureTrackingColumns_(sheet, headers);
  const syncedCol = idx[SYNCED_AT_HEADER];
  const idCol = idx[SYNCED_ID_HEADER];
  const errorCol = idx[SYNCED_ERROR_HEADER];
  const trackingCols = new Set([syncedCol, idCol, errorCol]);

  const startRowProp = Number(props_().getProperty('START_ROW'));
  const startIndex = startRowProp && startRowProp > 1 ? startRowProp - 1 : 1;

  let processed = 0;
  for (let r = startIndex; r < data.length && processed < budget; r++) {
    if (Date.now() > deadlineMs) {
      Logger.log('Вышло время прохода — остальное подберёт следующий тик.');
      return { processed, stop: true };
    }
    const row = data[r];
    if (row[syncedCol]) continue; // уже отправлена
    const nowMs = Date.now();
    if (!shouldAttemptRow_(row[errorCol], nowMs)) continue; // ждёт паузу повтора или сдалась (СТОП#)

    const payload = buildPayload_(row, idx, headers, trackingCols);
    if (!payload.fullName || !payload.phone) {
      if (row[errorCol] !== NO_CONTACT_ERROR) sheet.getRange(r + 1, errorCol + 1).setValue(NO_CONTACT_ERROR);
      continue;
    }

    try {
      const result = sendLead_(payload);
      sheet.getRange(r + 1, syncedCol + 1).setValue(new Date());
      sheet.getRange(r + 1, idCol + 1).setValue(result.id);
      sheet.getRange(r + 1, errorCol + 1).setValue(result.merged ? 'merged' : '');
    } catch (err) {
      const message = String(err.message || err);
      Logger.log(`${sheet.getName()}, строка ${r + 1}: ${message}`);
      if (isQuotaError_(message)) {
        // Не «плохая строка» — кончилась квота. Ячейку и счётчик попыток не трогаем, весь синк на паузу.
        blockSync_(message);
        return { processed: processed + 1, stop: true };
      }
      sheet.getRange(r + 1, errorCol + 1).setValue(failureCellText_(row[errorCol], message, nowMs));
    }
    processed += 1;
  }
  return { processed, stop: false };
}

/**
 * Основной проход — вызывается таймером (см. installTrigger). Проходит по
 * всем листам из SHEET_NAMES по очереди, суммарно обрабатывая до
 * MAX_ROWS_PER_RUN несинхронизированных строк за раз (не на лист, а на все
 * листы вместе) — остальные подберёт следующий запуск (через минуту).
 *
 * LockService обязателен: при большом бэкфилле один проход (до
 * MAX_ROWS_PER_RUN строк, каждая — блокирующий HTTP-запрос к API) может
 * занять больше минуты, и следующий тик триггера стартует НОВЫЙ снимок
 * листа (getDataRange), не видя строк, которые предыдущий проход ещё не
 * дошёл обработать — оба видят их «несинхронизированными» и отправляют
 * оба, создавая в CRM дубль лида. Воспроизведено на реальных данных
 * (несколько лидов с одинаковым телефоном, apiSyncedAt с разницей <2 сек).
 * Без лока — return сразу, следующий тик подхватит.
 */
function syncNewLeadsToCrm() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log('Предыдущий проход ещё выполняется — пропускаю этот тик.');
    return;
  }
  try {
    syncNewLeadsToCrm_();
  } finally {
    lock.releaseLock();
  }
}

function syncNewLeadsToCrm_() {
  const blockedMs = syncBlockedForMs_();
  if (blockedMs > 0) {
    // Ни таблицу, ни сеть не трогаем — вся проверка стоит долю секунды.
    Logger.log('Синк на паузе ещё ' + Math.ceil(blockedMs / 60000) + ' мин (квота/лимит) — пропускаю тик.');
    return;
  }
  const deadlineMs = Date.now() + RUN_TIME_BUDGET_MS;
  const ss = getSpreadsheet_();
  const sheetNames = getSheetNames_(ss);
  let budget = MAX_ROWS_PER_RUN;
  let totalProcessed = 0;

  for (const name of sheetNames) {
    if (budget <= 0) break;
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      Logger.log(`Лист "${name}" не найден в таблице — пропускаю.`);
      continue;
    }
    const { processed, stop } = syncSheet_(sheet, budget, deadlineMs);
    budget -= processed;
    totalProcessed += processed;
    if (stop) break;
  }
  Logger.log(`Обработано строк всего: ${totalProcessed} (листы: ${sheetNames.join(', ')})`);
}

/**
 * Ручной сброс: снимает паузу квоты и очищает «CRM error» у строк, которые ждут повтора
 * или сдались (ERR#/СТОП#), — они снова пойдут в работу. Запусти вручную (Run), когда
 * исправил причину ошибки. Строки без имени/телефона («Нет имени или телефона») не трогает.
 */
function retryFailedRows() {
  props_().deleteProperty(QUOTA_BLOCK_KEY);
  const ss = getSpreadsheet_();
  let cleared = 0;
  for (const name of getSheetNames_(ss)) {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) continue;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const errorCol = headers.indexOf(SYNCED_ERROR_HEADER);
    if (errorCol === -1) continue;
    const range = sheet.getRange(2, errorCol + 1, sheet.getLastRow() - 1, 1);
    const values = range.getValues();
    const next = values.map(([v]) => {
      const t = String(v || '');
      if (t.indexOf(ERR_PREFIX) === 0 || t.indexOf(GAVE_UP_PREFIX) === 0) {
        cleared += 1;
        return [''];
      }
      return [v];
    });
    range.setValues(next);
  }
  Logger.log('Пауза снята, ячеек «CRM error» очищено: ' + cleared + '.');
}

/**
 * Ручная проверка ОДНОЙ строки первого листа из SHEET_NAMES — запусти через
 * Run, прежде чем ставить триггер. Ничего не помечает в таблице, только
 * печатает в Execution log, что было бы отправлено и что ответил API.
 * Берёт ту же строку, с которой реально начнёт syncNewLeadsToCrm — учитывает
 * START_ROW, а не всегда первую строку данных.
 */
function testSyncOneRow() {
  const ss = getSpreadsheet_();
  const sheetNames = getSheetNames_(ss);
  const sheetName = sheetNames[0];
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`Лист "${sheetName}" не найден в таблице.`);
    return;
  }
  Logger.log(`Проверяю лист: "${sheetName}" (всего в SHEET_NAMES: ${sheetNames.join(', ')})`);

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log('В листе нет строк с данными.');
    return;
  }
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));

  const startRowProp = Number(props_().getProperty('START_ROW'));
  const startIndex = startRowProp && startRowProp > 1 ? startRowProp - 1 : 1;
  if (startIndex >= data.length) {
    Logger.log(`START_ROW=${startRowProp} — за пределами листа (в нём всего ${data.length - 1} строк данных).`);
    return;
  }

  Logger.log('Заголовки листа: ' + JSON.stringify(headers));
  Logger.log('START_ROW: ' + (startRowProp || '(не задан, тестируем первую строку данных)'));
  Logger.log(`Проверяю строку листа №${startIndex + 1}`);
  Logger.log('Сопоставление колонок (FIELD_HEADERS → индекс): ' + JSON.stringify(
    Object.keys(FIELD_HEADERS).reduce((acc, k) => ((acc[k] = FIELD_HEADERS[k].map((h) => idx[h])), acc), {}),
  ));

  const trackingCols = new Set([idx[SYNCED_AT_HEADER], idx[SYNCED_ID_HEADER], idx[SYNCED_ERROR_HEADER]]);
  const payload = buildPayload_(data[startIndex], idx, headers, trackingCols);
  Logger.log('Payload строки: ' + JSON.stringify(payload));

  if (!payload.fullName || !payload.phone) {
    Logger.log('Нет имени или телефона — API бы отклонил как невалидные данные.');
    return;
  }

  try {
    const result = sendLead_(payload);
    Logger.log('Ответ API: ' + JSON.stringify(result));
  } catch (err) {
    Logger.log('Ошибка при отправке: ' + (err.message || err));
  }
}

/** Запусти один раз вручную — ставит опрос каждую минуту (тик без работы и во время паузы квоты почти ничего не стоит). */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncNewLeadsToCrm')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNewLeadsToCrm').timeBased().everyMinutes(1).create();
  Logger.log('Триггер поставлен: syncNewLeadsToCrm каждую минуту.');
}
