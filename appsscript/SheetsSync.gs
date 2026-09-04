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
 * у всех листов должны быть одинаковые заголовки колонок (один COLUMN_MAP
 * на все). Если структура колонок отличается между листами — этот файл не
 * подходит, нужен свой COLUMN_MAP на лист (не реализовано, не было нужно).
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
// точный текст заголовка колонки в таблице. Только 4 поля, по заданию:
// имя (C), один телефон (D), доп. информация под «i» на карточке (F),
// время прихода лида (H). 2-raqami (E) и Joylashuvi (G) сознательно не
// синкаем — не нужны на карточке. Один и тот же COLUMN_MAP применяется ко
// ВСЕМ листам из SHEET_NAMES — заголовки должны совпадать дословно.
const COLUMN_MAP = {
  fullName: 'Ismi',
  phone: '1-raqami',
  russianLevel: 'Rus tilida qanday darajadasiz?',
  leadReceivedAt: 'Lead tushgan vaqti',
};

const SYNCED_AT_HEADER = 'CRM synced';
const SYNCED_ID_HEADER = 'CRM lead id';
const SYNCED_ERROR_HEADER = 'CRM error';
const MAX_ROWS_PER_RUN = 25; // общий бюджет на ВСЕ листы за один тик — не бьём rate limit (60/мин на ключ)

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

function buildPayload_(row, idx) {
  const get = (apiField) => {
    const header = COLUMN_MAP[apiField];
    const col = idx[header];
    return col === undefined ? null : row[col];
  };
  return {
    fullName: (get('fullName') || '').toString().trim(),
    phone: (get('phone') || '').toString().trim(),
    russianLevel: (get('russianLevel') || '').toString().trim() || undefined,
    leadReceivedAt: toIsoDate_(get('leadReceivedAt')) || undefined,
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

/**
 * Синкает один лист, обрабатывая не больше budget строк. Возвращает
 * фактически обработанное количество (списывается с общего бюджета в
 * syncNewLeadsToCrm_, чтобы три листа вместе не превысили MAX_ROWS_PER_RUN
 * за один тик).
 */
function syncSheet_(sheet, budget) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;

  const headers = data[0];
  const idx = ensureTrackingColumns_(sheet, headers);
  const syncedCol = idx[SYNCED_AT_HEADER];
  const idCol = idx[SYNCED_ID_HEADER];
  const errorCol = idx[SYNCED_ERROR_HEADER];

  const startRowProp = Number(props_().getProperty('START_ROW'));
  const startIndex = startRowProp && startRowProp > 1 ? startRowProp - 1 : 1;

  let processed = 0;
  for (let r = startIndex; r < data.length && processed < budget; r++) {
    const row = data[r];
    if (row[syncedCol]) continue; // уже отправлена

    const payload = buildPayload_(row, idx);
    if (!payload.fullName || !payload.phone) {
      sheet.getRange(r + 1, errorCol + 1).setValue('Нет имени или телефона — пропущена');
      continue;
    }

    try {
      const result = sendLead_(payload);
      sheet.getRange(r + 1, syncedCol + 1).setValue(new Date());
      sheet.getRange(r + 1, idCol + 1).setValue(result.id);
      sheet.getRange(r + 1, errorCol + 1).setValue(result.merged ? 'merged' : '');
    } catch (err) {
      sheet.getRange(r + 1, errorCol + 1).setValue(String(err.message || err));
      Logger.log(`${sheet.getName()}, строка ${r + 1}: ${err.message || err}`);
    }
    processed += 1;
  }
  return processed;
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
    const processed = syncSheet_(sheet, budget);
    budget -= processed;
    totalProcessed += processed;
  }
  Logger.log(`Обработано строк всего: ${totalProcessed} (листы: ${sheetNames.join(', ')})`);
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
  Logger.log('Сопоставление колонок (COLUMN_MAP → индекс): ' + JSON.stringify(
    Object.keys(COLUMN_MAP).reduce((acc, k) => ((acc[k] = idx[COLUMN_MAP[k]]), acc), {}),
  ));

  const payload = buildPayload_(data[startIndex], idx);
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

/** Запусти один раз вручную — ставит опрос каждую минуту. */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncNewLeadsToCrm')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncNewLeadsToCrm').timeBased().everyMinutes(1).create();
  Logger.log('Триггер поставлен: syncNewLeadsToCrm каждую минуту.');
}
