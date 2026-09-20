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
 * КАЖДЫЙ ПРОГОН ПЕРЕЗАПИСЫВАЕТ лист целиком (не апдейт по индексу строки) —
 * так порядок по времени гарантирован. Но won/lost в CRM НЕ ЧИТАЮТСЯ: лид,
 * получивший финальный статус, больше не меняется, поэтому его строка
 * остаётся в листе как есть (см. exportOnce_). Из CRM каждый прогон
 * забираются только «живые» стадии (new, calling, trial_scheduled, trial_completed, closing) плюс
 * won/lost за последние RECENT_FINAL_DAYS дней (чтобы поймать лидов,
 * которые появились и сразу стали won/lost между прогонами). Полная выгрузка
 * won/lost — только при пустом листе и когда в листе есть «живая» строка,
 * которой уже нет среди живых стадий CRM (значит она ушла в won/lost, а
 * webhook doPost её не обновил).
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
 *   6. Когда ок — Run → installExportTrigger — 3 раза в день.
 *
 * Важно про частоту: раз в минуту/раз в 10 минут (было раньше) упирается в
 * дневную квоту Apps Script на UrlFetchApp — при 7 стадиях воронки ×
 * пагинации даже 144 прогона/день (10 минут) заметно расходуют лимит,
 * экспорт встаёт на весь остаток дня (квота сбрасывается по тихоокеанскому
 * времени). 3 раза в день — мгновенное обновление статуса и так идёт через
 * doPost (см. ниже), этот триггер только страховка/подхват новых лидов.
 */

const SHEET_NAME = 'leads 15 sept';

// Порядок и ключи — см. src/components/leads/columns.js в репозитории CRM,
// это единственное место правды по стадиям воронки.
const ACTIVE_STAGES = ['new', 'calling', 'trial_scheduled', 'trial_completed', 'closing'];
const FINAL_STAGES = ['won', 'lost'];
// Значения колонки «Статус» (см. statusLabel_), которые больше не перечитываются.
const FINAL_STATUSES = ['won', 'lost'];
// won/lost, созданные за последние N дней, перечитываются каждый прогон —
// это страховка для лидов, которых ещё нет в листе (см. exportOnce_).
const RECENT_FINAL_DAYS = 7;
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

/**
 * Все лиды данной стадии (все страницы), уже отфильтрованные по ALLOWED_SOURCES.
 * `createdAfter` (ISO) — только лиды, созданные не раньше этого момента (сервер
 * сам ограничивает выборку, если Code.gs задеплоен с поддержкой created_after).
 */
function fetchStage_(stage, createdAfter) {
  const out = [];
  let page = 1;
  for (;;) {
    const params = { status: stage, per_page: '100', page: String(page) };
    if (createdAfter) params.created_after = createdAfter;
    const json = apiGet_('list', params);
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

/** «дд.мм.гг чч:мм» (или Date, если Sheets сам превратил строку в дату) → мс, 0 если не распарсилось. */
function parseSheetTime_(value) {
  if (value instanceof Date) return value.getTime();
  const m = /^(\d{2})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m) return 0;
  return new Date(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
}

/** Строки данных листа (без шапки и без пустых по id) — как массивы значений в порядке HEADER. */
function readExistingRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const idCol = HEADER.indexOf('id');
  return sheet
    .getRange(2, 1, lastRow - 1, HEADER.length)
    .getValues()
    .filter((r) => String(r[idCol]).trim() !== '');
}

function exportOnce_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Лист "' + SHEET_NAME + '" не найден в таблице.');
  ensureHeader_(sheet);

  const idCol = HEADER.indexOf('id');
  const statusCol = HEADER.indexOf('Статус');
  const timeCol = HEADER.indexOf('created_time');
  const existing = readExistingRows_(sheet);

  // 1) «Живые» стадии — читаем всегда, там статус ещё меняется.
  const active = ACTIVE_STAGES.reduce((acc, st) => acc.concat(fetchStage_(st)), []);
  const activeKeys = {};
  active.forEach((lead) => {
    activeKeys[leadKey_(lead)] = true;
  });

  // 2) won/lost — по умолчанию НЕ читаем существующие строки. Полная выгрузка
  // нужна только если лист пуст (первый прогон) или в нём есть «живая» строка,
  // которой уже нет среди живых стадий CRM: лид ушёл в won/lost, а webhook
  // (doPost) строку не обновил. Иначе — только won/lost за последние
  // RECENT_FINAL_DAYS дней: строк для них в листе ещё может не быть.
  const vanished = existing.filter(
    (r) => FINAL_STATUSES.indexOf(String(r[statusCol])) === -1 && !activeKeys[String(r[idCol])],
  );
  const fullFinal = existing.length === 0 || vanished.length > 0;
  const cutoff = fullFinal ? null : new Date(Date.now() - RECENT_FINAL_DAYS * 86400000).toISOString();
  const finals = FINAL_STAGES.reduce((acc, st) => acc.concat(fetchStage_(st, cutoff)), []);
  Logger.log(
    'won/lost: ' + (fullFinal ? 'полная выгрузка (лист пуст или есть ушедшие «живые» строки: ' + vanished.length + ')' : 'только за ' + RECENT_FINAL_DAYS + ' дн.') +
      ', получено ' + finals.length + '.',
  );

  // 3) Свежие данные CRM + строки листа, которых в них нет (старые won/lost остаются как были).
  const fetched = active.concat(finals);
  const fetchedKeys = {};
  const items = fetched.map((lead) => {
    fetchedKeys[leadKey_(lead)] = true;
    return { ts: new Date(lead.createdAt || 0).getTime() || 0, row: leadRow_(lead) };
  });
  existing.forEach((r) => {
    if (!fetchedKeys[String(r[idCol])]) items.push({ ts: parseSheetTime_(r[timeCol]), row: r });
  });
  // По времени попадания в CRM, новые сверху — иначе порядок шёл блоками
  // по статусу (сперва все in process, потом qual...), не по факту прихода.
  items.sort((a, b) => b.ts - a.ts);
  const rows = items.map((it) => it.row);

  // Полная перезапись данных (без шапки), не апдейт по индексу строки —
  // так порядок по времени гарантирован при каждом прогоне.
  const allocatedDataRows = sheet.getMaxRows() - 1;
  if (allocatedDataRows > 0) {
    sheet.getRange(2, 1, allocatedDataRows, HEADER.length).clearContent();
  }
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, HEADER.length).setValues(rows);
  }

  Logger.log('Готово: строк записано ' + rows.length + ' (из CRM ' + fetched.length + ', оставлено из листа ' + (rows.length - fetched.length) + ').');
}

/**
 * Запусти один раз вручную — ставит опрос 3 раза в день (~каждые 8 часов).
 * Это только страховка (подхват новых лидов + пересборка полного листа на
 * случай, если какой-то webhook-вызов потерялся) — мгновенное обновление
 * статуса при смене стадии лида идёт через doPost (см. ниже), от этого
 * триггера скорость уже не зависит.
 *
 * Было каждую минуту, потом раз в 10 минут — оба упирались в дневную квоту
 * Apps Script на UrlFetchApp («Service invoked too many times for one day:
 * urlfetch», сбрасывается по тихоокеанскому времени, поэтому экспорт
 * вставал каждый день в одно и то же время по Ташкенту и не
 * восстанавливался до следующего дня). При 7 стадиях воронки × пагинации
 * даже 10 минут — это 144 прогона/день; 3 раза в день — на два порядка
 * меньше трафика.
 */
function installExportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'exportOnce')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('exportOnce').timeBased().everyHours(8).create();
  Logger.log('Триггер поставлен: exportOnce 3 раза в день (каждые 8 часов).');
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
