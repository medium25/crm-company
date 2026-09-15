/**
 * Экспорт лидов из CRM в Google Sheets — ОДИН лист, один ряд на лида,
 * статус в отдельной колонке, порядок строк — по времени попадания лида в
 * CRM (created_time, новые сверху). Обратная сторона SheetsSync.gs (тот
 * льёт лидов ИЗ таблицы В CRM, этот — наоборот). Живёт в ОТДЕЛЬНОЙ
 * таблице, своим container-bound Apps Script проектом — читает CRM только
 * через GET (appsscript/Code.gs, action=list), в CRM ничего не пишет.
 *
 * Только source in [meta_target, target_manual] («Таргет»/«Таргет (р)») —
 * instagram/street/word_of_mouth/... в лист не попадают вовсе.
 *
 * Статус — 4 значения, маппинг с funnelStage CRM (см.
 * src/components/leads/columns.js — 7 стадий воронки):
 *   in process — new, calling
 *   qual       — trial_scheduled, trial_completed, closing
 *   won        — won
 *   lost       — lost
 * won/lost — финальные фактически (funnelStage не меняется задним числом
 * даже если студент потом ушёл/архивировался).
 *
 * КАЖДЫЙ ПРОГОН ПОЛНОСТЬЮ ПЕРЕЗАПИСЫВАЕТ данные (не апдейт по индексу
 * строки) — так порядок по времени гарантирован, и любой мусор от
 * предыдущих версий скрипта/ручных правок самовосстанавливается за один
 * тик, а не накапливается. Строка полностью определяется текущим
 * состоянием CRM, вручную в неё лучше не писать — перезапишет.
 *
 * Настройка:
 *   1. В целевой таблице: Extensions → Apps Script.
 *   2. Вставь этот файл целиком.
 *   3. Project Settings → Script Properties:
 *        LEADS_API_URL — тот же Web App URL, что в SheetsSync.gs (см. API.md)
 *        LEADS_API_KEY — ключ scope read (write тоже подойдёт, но этот
 *                         скрипт только читает — safer дать read-only)
 *   4. Название листа должно БУКВАЛЬНО совпадать с SHEET_NAME ниже.
 *   5. Run → exportOnce — разовый прогон, глянь Execution log и сам лист.
 *   6. Когда ок — Run → installExportTrigger — раз в минуту.
 *
 * Важно про частоту: раз в минуту — это несколько Firestore-чтений на
 * каждый тик (по одному GET на каждую стадию воронки + резолв имени
 * оператора на лида), при большом объёме лидов может заметно нагружать
 * API/квоты. Если станет тяжело — просто переустанови триггер на editable
 * интервал (everyMinutes(5) и т.п. в installExportTrigger).
 */

const SHEET_NAME = 'in process';

// Порядок и ключи — см. src/components/leads/columns.js в репозитории CRM,
// это единственное место правды по стадиям воронки.
const STAGES = ['new', 'calling', 'trial_scheduled', 'trial_completed', 'closing', 'won', 'lost'];
const ALLOWED_SOURCES = ['meta_target', 'target_manual'];

const QUAL_STAGES = ['trial_scheduled', 'trial_completed', 'closing'];

/** funnelStage CRM → один из 4 статусов в таблице. */
function statusLabel_(funnelStage) {
  if (funnelStage === 'won') return 'won';
  if (funnelStage === 'lost') return 'lost';
  if (QUAL_STAGES.indexOf(funnelStage) !== -1) return 'qual';
  return 'in process';
}

// Порядок колонок: время попадания лида первым столбцом (дд.мм.гг чч:мм,
// см. formatLeadTime_), дальше id + Статус, дальше порядок в исходной
// таблице лидов (той, что льётся в CRM через SheetsSync.gs) + один новый
// столбец в конце.
const HEADER = [
  'created_time',
  'id',
  'Статус',
  'ad_id',
  'ad_name',
  'adset_id',
  'adset_name',
  'campaign_id',
  'campaign_name',
  'form_id',
  'form_name',
  'is_organic',
  'platform',
  'toshkentda_yashaysizmi?',
  "rus_tilini_nima_sababdan_o'rganmoqchisiz?",
  'ismingiz:',
  "bog'lanish_uchun_raqam_qoldiring:",
  'полное_имя',
  'номер_телефона',
  'lead_status',
  'Ответственный',
];

function props_() {
  return PropertiesService.getScriptProperties();
}

const MAX_RETRIES = 3;

/**
 * До 3 попыток с паузой — время от времени UrlFetchApp получает от
 * инфраструктуры Google (не от нашего Code.gs — тот всегда отвечает
 * валидным JSON, даже на свою собственную ошибку 429) HTML-страницу
 * вместо ответа скрипта, похоже на кратковременный сбой между двумя Apps
 * Script проектами. Без ретрая один такой сбой на любой из десятков
 * запросов за прогон валил весь exportOnce_ целиком.
 */
function apiGet_(action, params) {
  const apiUrl = props_().getProperty('LEADS_API_URL');
  const apiKey = props_().getProperty('LEADS_API_KEY');
  if (!apiUrl || !apiKey) throw new Error('LEADS_API_URL/LEADS_API_KEY не заданы в Script Properties.');
  const qs = Object.assign({ apiKey: apiKey, action: action }, params || {});
  const query = Object.keys(qs)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]))
    .join('&');
  const url = apiUrl + '?' + query;

  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    const text = resp.getContentText();
    let json;
    try {
      json = JSON.parse(text);
    } catch (err) {
      Logger.log(
        'apiGet_ (' + action + ', ' + JSON.stringify(params) + '), попытка ' + attempt + '/' + MAX_RETRIES +
          ': HTTP ' + resp.getResponseCode() + ', тело не JSON: ' + text.slice(0, 300),
      );
      lastErr = new Error('Ответ API не JSON (HTTP ' + resp.getResponseCode() + ') — см. лог выше.');
      if (attempt < MAX_RETRIES) Utilities.sleep(1000 * attempt);
      continue;
    }
    if (json.status >= 400) throw new Error(json.error || 'API вернул статус ' + json.status);
    return json;
  }
  throw lastErr;
}

/** Все лиды данной стадии (все страницы), уже отфильтрованные по ALLOWED_SOURCES. */
function fetchStage_(stage) {
  const out = [];
  let page = 1;
  for (;;) {
    const json = apiGet_('list', { status: stage, per_page: '100', page: String(page) });
    json.data.forEach((lead) => {
      if (ALLOWED_SOURCES.indexOf(lead.source) !== -1) out.push(lead);
    });
    if (page * 100 >= json.total) break;
    page += 1;
  }
  return out;
}

/**
 * Ключ строки — id самого лида из формы (rawColumns.id, тот же Meta lead
 * id, что в исходной таблице), если есть. Ручные лиды (target_manual,
 * заведены прямо в CRM, без rawColumns) — свой id в CRM с префиксом, чтобы
 * не столкнуться с настоящими Meta id.
 */
function leadKey_(lead) {
  return lead.rawColumns && lead.rawColumns.id ? String(lead.rawColumns.id) : 'crm:' + lead.id;
}

/**
 * Запасные значения из самой карточки CRM (не из формы) — используются
 * только когда rawColumns нет вообще (лид заведён вручную — target_manual,
 * или создан до появления дампа формы). Без этого такие строки были
 * пустыми везде, кроме id — не за что зацепиться глазами, кто это.
 */
const FALLBACK_FIELDS = {
  'полное_имя': (lead) => lead.fullName || '',
  'номер_телефона': (lead) => lead.phone || '',
  created_time: (lead) => lead.createdAt || '',
};

const NO_DATA = 'нет данных';

/** ISO-строка/Date → «дд.мм.гг чч:мм» в часовом поясе скрипта, либо null если не распарсилось. */
function formatLeadTime_(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd.MM.yy HH:mm');
}

function leadRow_(lead) {
  const raw = lead.rawColumns || {};
  const hasRaw = Boolean(lead.rawColumns);
  const key = leadKey_(lead);
  return HEADER.map((h) => {
    if (h === 'created_time') {
      const rawVal = raw['created_time'];
      const source = rawVal !== undefined && rawVal !== null && rawVal !== '' ? rawVal : !hasRaw ? FALLBACK_FIELDS.created_time(lead) : '';
      return formatLeadTime_(source) || NO_DATA;
    }
    if (h === 'Статус') return statusLabel_(lead.funnelStage);
    if (h === 'Ответственный') return lead.assignedOperatorName || NO_DATA;
    if (h === 'id') return key;
    const v = raw[h];
    if (v !== undefined && v !== null && v !== '') return v;
    const fallback = !hasRaw && FALLBACK_FIELDS[h] ? FALLBACK_FIELDS[h](lead) : '';
    // Ни одна ячейка не должна оставаться пустой — вместо этого честно
    // пишем «нет данных», чтобы визуально не путать с «строка сломана»
    // или «поле реально пустое в форме».
    return fallback || NO_DATA;
  });
}

function ensureHeader_(sheet) {
  const width = Math.max(sheet.getLastColumn(), HEADER.length);
  const first = sheet.getRange(1, 1, 1, width).getValues()[0].slice(0, HEADER.length);
  if (first.join('') !== HEADER.join('')) {
    sheet.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
  }
}

function exportOnce() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    Logger.log('Предыдущий проход ещё выполняется — пропускаю этот тик.');
    return;
  }
  try {
    exportOnce_();
  } finally {
    lock.releaseLock();
  }
}

function exportOnce_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Лист "' + SHEET_NAME + '" не найден в таблице.');
  ensureHeader_(sheet);

  const leads = STAGES.reduce((acc, s) => acc.concat(fetchStage_(s)), []);
  // По времени попадания в CRM, новые сверху — иначе порядок шёл блоками
  // по статусу (сперва все in process, потом qual...), не по факту прихода.
  leads.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const rows = leads.map(leadRow_);

  // Полная перезапись данных (без шапки), не апдейт по индексу строки —
  // так порядок по времени гарантирован при каждом прогоне, и любой мусор
  // от предыдущих версий/ручных правок сам исчезает за один тик, вместо
  // накопления дыр и висящих строк между перезапусками.
  const allocatedDataRows = sheet.getMaxRows() - 1;
  if (allocatedDataRows > 0) {
    sheet.getRange(2, 1, allocatedDataRows, HEADER.length).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADER.length).setValues(rows);
  }

  Logger.log('Готово: строк записано ' + rows.length + '.');
}

/** Запусти один раз вручную — ставит опрос каждую минуту (страховка, см. doPost ниже). */
function installExportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'exportOnce')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('exportOnce').timeBased().everyMinutes(1).create();
  Logger.log('Триггер поставлен: exportOnce каждую минуту.');
}

/**
 * Мгновенное обновление одной строки — вызывается фронтендом CRM сразу
 * после смены funnelStage лида (см. src/lib/sheetsExportHook.js), чтобы
 * колонка «Статус» не ждала минутного триггера (нужно для CAPI в
 * Facebook — конверсия должна попасть в таблицу как можно быстрее).
 * Обновляет ТОЛЬКО колонку «Статус» найденной строки, остальные поля не
 * трогает — их досчитает ближайший exportOnce. Если строки ещё нет (лид
 * только что создан и не попал ни в один exportOnce) — молча выходит,
 * следующий exportOnce (раз в минуту) добавит её сам.
 *
 * Требует отдельный Web App деплой ЭТОГО файла (Deploy → New deployment →
 * Web app, Execute as: me, Who has access: Anyone) — отдельный от
 * appsscript/Code.gs. Script Properties: EXPORT_HOOK_SECRET — произвольная
 * строка, должна совпадать с VITE_SHEETS_EXPORT_HOOK_SECRET в .env
 * фронтенда.
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = props_().getProperty('EXPORT_HOOK_SECRET');
    if (!secret || body.secret !== secret) {
      return jsonOutput_({ status: 401, error: 'unauthorized' });
    }
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) {
      return jsonOutput_({ status: 429, error: 'busy, следующий exportOnce досчитает' });
    }
    try {
      updateStatusInPlace_(body.id, body.rawId, body.funnelStage);
    } finally {
      lock.releaseLock();
    }
    return jsonOutput_({ status: 200 });
  } catch (err) {
    return jsonOutput_({ status: 500, error: String(err) });
  }
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function updateStatusInPlace_(leadId, rawId, funnelStage) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const key = rawId ? String(rawId) : 'crm:' + leadId;
  const idCol = HEADER.indexOf('id') + 1;
  const statusCol = HEADER.indexOf('Статус') + 1;
  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === key) {
      sheet.getRange(i + 2, statusCol).setValue(statusLabel_(funnelStage));
      return;
    }
  }
  Logger.log('updateStatusInPlace_: строка для ' + key + ' ещё не найдена, ждём exportOnce.');
}
