/**
 * Экспорт лидов из CRM в Google Sheets — 3 листа по исходу воронки: in
 * process / won / lost. Обратная сторона SheetsSync.gs (тот льёт лидов ИЗ
 * таблицы В CRM, этот — наоборот). Живёт в ОТДЕЛЬНОЙ таблице, своим
 * container-bound Apps Script проектом — читает CRM только через GET
 * (appsscript/Code.gs, action=list), в CRM ничего не пишет.
 *
 * Только source in [meta_target, target_manual] («Таргет»/«Таргет (р)») —
 * instagram/street/word_of_mouth/... в эти листы не попадают вовсе.
 *
 * won/lost — финальные: лид остаётся там навсегда, даже если студент потом
 * ушёл/архивировался (funnelStage не меняется задним числом).
 *
 * Настройка:
 *   1. В целевой таблице (той, что с листами in process/won/lost):
 *      Extensions → Apps Script.
 *   2. Вставь этот файл целиком.
 *   3. Project Settings → Script Properties:
 *        LEADS_API_URL — тот же Web App URL, что в SheetsSync.gs (см. API.md)
 *        LEADS_API_KEY — ключ scope read (write тоже подойдёт, но этот
 *                         скрипт только читает — safer дать read-only)
 *   4. Названия листов должны БУКВАЛЬНО совпадать с SHEETS ниже: "in
 *      process", "won", "lost". Другие имена — поправь SHEETS в коде.
 *   5. Run → exportOnce — разовый прогон, глянь Execution log и сами листы.
 *   6. Когда ок — Run → installExportTrigger — раз в минуту.
 *
 * Важно про частоту: раз в минуту — это N Firestore-чтений на каждый тик
 * (по одному GET на каждую стадию воронки + резолв имени оператора на
 * лида), при большом объёме лидов может заметно нагружать API/квоты. Если
 * станет тяжело — просто переустанови триггер на editable интервал
 * (everyMinutes(5) и т.п. в installExportTrigger).
 */

const SHEETS = {
  in_process: 'in process',
  won: 'won',
  lost: 'lost',
};

// Порядок и ключи — см. src/components/leads/columns.js в репозитории CRM,
// это единственное место правды по стадиям воронки.
const IN_PROCESS_STAGES = ['new', 'calling', 'trial_scheduled', 'trial_completed', 'closing'];
const ALLOWED_SOURCES = ['meta_target', 'target_manual'];

// Порядок колонок = порядок в исходной таблице лидов (той, что льётся в
// CRM через SheetsSync.gs) + один новый столбец в конце.
const HEADER = [
  'id',
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

function leadRow_(lead) {
  const raw = lead.rawColumns || {};
  const hasRaw = Boolean(lead.rawColumns);
  const key = leadKey_(lead);
  return HEADER.map((h) => {
    if (h === 'Ответственный') return lead.assignedOperatorName || '';
    // 'id' — всегда ключ сопоставления (leadKey_), не raw['id'] напрямую:
    // у лидов без rawColumns (заведены до этой фичи, или вручную) raw
    // пустой, и колонка id молча оставалась пустой — readSheetIndex_ такую
    // строку не индексирует (пустой id пропускается), и при каждом прогоне
    // она плодилась заново дублем вместо апдейта на месте.
    if (h === 'id') return key;
    const v = raw[h];
    if (v !== undefined && v !== null) return v;
    return !hasRaw && FALLBACK_FIELDS[h] ? FALLBACK_FIELDS[h](lead) : '';
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
  if (first.join('') !== HEADER.join('')) {
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
  const sheetByBucket = {};
  const indexByBucket = {};
  Object.keys(SHEETS).forEach((bucket) => {
    const sheet = ss.getSheetByName(SHEETS[bucket]);
    if (!sheet) throw new Error('Лист "' + SHEETS[bucket] + '" не найден в таблице.');
    ensureHeader_(sheet);
    sheetByBucket[bucket] = sheet;
    indexByBucket[bucket] = readSheetIndex_(sheet);
  });

  const buckets = {
    in_process: IN_PROCESS_STAGES.reduce((acc, s) => acc.concat(fetchStage_(s)), []),
    won: fetchStage_('won'),
    lost: fetchStage_('lost'),
  };

  let written = 0;

  Object.keys(buckets).forEach((bucket) => {
    buckets[bucket].forEach((lead) => {
      const key = leadKey_(lead);
      const row = leadRow_(lead);

      // Убрать из ДРУГИХ листов, если лид туда раньше попал (переехал по воронке).
      Object.keys(SHEETS).forEach((otherBucket) => {
        if (otherBucket === bucket) return;
        const idx = indexByBucket[otherBucket];
        if (idx.has(key)) {
          const rowToDelete = idx.get(key);
          sheetByBucket[otherBucket].deleteRow(rowToDelete);
          idx.delete(key);
          idx.forEach((r, k) => {
            if (r > rowToDelete) idx.set(k, r - 1);
          });
        }
      });

      const ownIdx = indexByBucket[bucket];
      if (ownIdx.has(key)) {
        sheetByBucket[bucket].getRange(ownIdx.get(key), 1, 1, HEADER.length).setValues([row]);
      } else {
        sheetByBucket[bucket].appendRow(row);
        ownIdx.set(key, sheetByBucket[bucket].getLastRow());
      }
      written += 1;
    });
  });

  Logger.log('Экспортировано/обновлено строк: ' + written);
}

/** Запусти один раз вручную — ставит опрос каждую минуту. */
function installExportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'exportOnce')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('exportOnce').timeBased().everyMinutes(1).create();
  Logger.log('Триггер поставлен: exportOnce каждую минуту.');
}
