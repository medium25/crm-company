/**
 * Экспорт лидов из CRM в Google Sheets — ОДИН лист, один ряд на лида,
 * статус в отдельной колонке (обновляется на месте при смене стадии в
 * CRM — никакого переноса строк между листами). Обратная сторона
 * SheetsSync.gs (тот льёт лидов ИЗ таблицы В CRM, этот — наоборот). Живёт
 * в ОТДЕЛЬНОЙ таблице, своим container-bound Apps Script проектом —
 * читает CRM только через GET (appsscript/Code.gs, action=list), в CRM
 * ничего не пишет.
 *
 * Только source in [meta_target, target_manual] («Таргет»/«Таргет (р)») —
 * instagram/street/word_of_mouth/... в лист не попадают вовсе.
 *
 * Статус — 4 значения (STATUS_LABEL ниже), маппинг с funnelStage CRM
 * (см. src/components/leads/columns.js — 7 стадий воронки):
 *   in process — new, calling
 *   qual       — trial_scheduled, trial_completed, closing
 *   won        — won
 *   lost       — lost
 * won/lost — финальные фактически (funnelStage не меняется задним числом
 * даже если студент потом ушёл/архивировался), но технически строка
 * продолжает обновляться каждый тик как и любая другая — просто её
 * funnelStage больше не меняется само по себе.
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

// Порядок колонок = Статус сразу после id (видно без скролла) + порядок в
// исходной таблице лидов (той, что льётся в CRM через SheetsSync.gs) +
// один новый столбец в конце.
const HEADER = [
  'id',
  'Статус',
  'created_time',
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

function apiGet_(action, params) {
  const apiUrl = props_().getProperty('LEADS_API_URL');
  const apiKey = props_().getProperty('LEADS_API_KEY');
  if (!apiUrl || !apiKey) throw new Error('LEADS_API_URL/LEADS_API_KEY не заданы в Script Properties.');
  const qs = Object.assign({ apiKey: apiKey, action: action }, params || {});
  const query = Object.keys(qs)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]))
    .join('&');
  const resp = UrlFetchApp.fetch(apiUrl + '?' + query, { muteHttpExceptions: true, followRedirects: true });
  const text = resp.getContentText();
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    // Не JSON — обычно HTML-страница авторизации/ошибки Google вместо
    // ответа скрипта. Логируем начало тела и HTTP-код целиком, чтобы не
    // гадать вслепую при повторном сбое.
    Logger.log('apiGet_ (' + action + ', ' + JSON.stringify(params) + '): HTTP ' + resp.getResponseCode() + ', тело не JSON: ' + text.slice(0, 300));
    throw new Error('Ответ API не JSON (HTTP ' + resp.getResponseCode() + ') — см. лог выше.');
  }
  if (json.status >= 400) throw new Error(json.error || 'API вернул статус ' + json.status);
  return json;
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

function leadRow_(lead) {
  const raw = lead.rawColumns || {};
  const hasRaw = Boolean(lead.rawColumns);
  const key = leadKey_(lead);
  return HEADER.map((h) => {
    if (h === 'Статус') return statusLabel_(lead.funnelStage);
    if (h === 'Ответственный') return lead.assignedOperatorName || NO_DATA;
    // 'id' — всегда ключ сопоставления (leadKey_), не raw['id'] напрямую:
    // у лидов без rawColumns (заведены до этой фичи, или вручную) raw
    // пустой, и колонка id молча оставалась пустой — readSheetIndex_ такую
    // строку не индексирует (пустой id пропускается), и при каждом прогоне
    // она плодилась заново дублем вместо апдейта на месте.
    if (h === 'id') return key;
    const v = raw[h];
    if (v !== undefined && v !== null && v !== '') return v;
    const fallback = !hasRaw && FALLBACK_FIELDS[h] ? FALLBACK_FIELDS[h](lead) : '';
    // Ни одна ячейка не должна оставаться пустой — вместо этого честно
    // пишем «нет данных», чтобы визуально не путать с «строка сломана»
    // (пустой id/дубль) или «поле реально пустое в форме».
    return fallback || NO_DATA;
  });
}

/** Map(key → номер строки листа, 1-based) по колонке A, без учёта заголовка. */
function readSheetIndex_(sheet) {
  const map = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return map;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  ids.forEach((row, i) => {
    const id = row[0];
    if (id) map.set(String(id), i + 2);
  });
  return map;
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
  const index = readSheetIndex_(sheet);

  const leads = STAGES.reduce((acc, s) => acc.concat(fetchStage_(s)), []);

  let created = 0;
  let updated = 0;

  leads.forEach((lead) => {
    const key = leadKey_(lead);
    const row = leadRow_(lead);
    if (index.has(key)) {
      sheet.getRange(index.get(key), 1, 1, HEADER.length).setValues([row]);
      updated += 1;
    } else {
      sheet.appendRow(row);
      index.set(key, sheet.getLastRow());
      created += 1;
    }
  });

  Logger.log('Готово: новых строк ' + created + ', обновлено на месте ' + updated + ' (всего лидов: ' + leads.length + ').');
}

/** Запусти один раз вручную — ставит опрос каждую минуту. */
function installExportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'exportOnce')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('exportOnce').timeBased().everyMinutes(1).create();
  Logger.log('Триггер поставлен: exportOnce каждую минуту.');
}
