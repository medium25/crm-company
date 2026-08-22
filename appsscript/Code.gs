/**
 * Внешний API приёма/выдачи лидов — Web App поверх Firestore REST API
 * (Cloud Functions сознательно не используются, проект на бесплатном
 * Spark-плане, см. scripts/seed.js и API.md). Ходит в Firestore под
 * сервис-аккаунтом (Script Properties), который не подчиняется
 * firestore.rules — сами правила проверяют только клиентский SDK
 * (браузер/scripts/*.mjs), не этот Web App.
 *
 * ВАЖНО про транспорт: Apps Script Web App всегда отвечает HTTP 200, если
 * выполнение не упало необработанным исключением — управлять реальным HTTP
 * статус-кодом (400/401/429) отсюда нельзя. Поэтому у каждого ответа есть
 * поле `status` внутри JSON-тела — ориентируйся на него, не на транспортный
 * код. Так же нет доступа к заголовку Authorization (Apps Script его не
 * передаёт в e) — ключ передаётся полем apiKey в теле (POST) или query-
 * параметром apiKey (GET).
 *
 * Настройка (см. appsscript/README.md для деталей):
 *   Project Settings → Script Properties:
 *     FIRESTORE_PROJECT_ID
 *     SERVICE_ACCOUNT_EMAIL
 *     SERVICE_ACCOUNT_PRIVATE_KEY   (весь PEM, включая BEGIN/END строки)
 *     DEFAULT_BRANCH_ID             (по умолчанию 'icon-main')
 */

const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';
const TOKEN_CACHE_KEY = 'firestore_access_token';
const RATE_LIMIT_PER_MINUTE = 60;

function props_() {
  return PropertiesService.getScriptProperties();
}

function projectId_() {
  return props_().getProperty('FIRESTORE_PROJECT_ID');
}

function defaultBranchId_() {
  return props_().getProperty('DEFAULT_BRANCH_ID') || 'icon-main';
}

function firestoreBaseUrl_() {
  return `https://firestore.googleapis.com/v1/projects/${projectId_()}/databases/(default)/documents`;
}

/** base64url без паддинга — как требует JWT. */
function base64url_(bytesOrString) {
  const bytes = typeof bytesOrString === 'string' ? Utilities.newBlob(bytesOrString).getBytes() : bytesOrString;
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

/**
 * Приводит private_key из JSON-ключа сервис-аккаунта к PEM, который
 * принимает Utilities.computeRsaSha256Signature: реальные переносы строк
 * (JSON хранит их как буквальные "\n"), без окружающих кавычек/пробелов,
 * которые остаются, если значение скопировано из JSON-файла как есть.
 */
function normalizePrivateKey_(raw) {
  let key = (raw || '').trim();
  if (key.startsWith('"') && key.endsWith('"')) key = key.slice(1, -1);
  key = key.replace(/\\n/g, '\n').trim();
  // Если вставили только base64-тело без -----BEGIN/END----- строк — Google
  // JSON-ключ их даёт, но их легко потерять при ручном копировании —
  // достраиваем PEM-обёртку сами.
  if (!key.startsWith('-----BEGIN')) {
    const body = key.replace(/\s+/g, '');
    key = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
  }
  return key;
}

/**
 * Отладка настройки сервис-аккаунта — запусти вручную (выбери testKeySetup
 * в выпадающем списке функций сверху редактора → Run), не через веб-запрос.
 * Пишет в Execution log (Ctrl+Enter / иконка часов слева) ровно то, что не
 * так: пустое свойство, неверный формат PEM или сам access_token.
 */
function testKeySetup() {
  const email = props_().getProperty('SERVICE_ACCOUNT_EMAIL');
  const rawKey = props_().getProperty('SERVICE_ACCOUNT_PRIVATE_KEY');
  Logger.log('SERVICE_ACCOUNT_EMAIL: ' + (email || '(пусто!)'));
  Logger.log('SERVICE_ACCOUNT_PRIVATE_KEY длина сырого значения: ' + (rawKey ? rawKey.length : 0));

  const key = normalizePrivateKey_(rawKey);
  Logger.log('После нормализации, первые 40 символов: ' + key.slice(0, 40));
  Logger.log('После нормализации, последние 40 символов: ' + key.slice(-40));
  Logger.log('Начинается с "-----BEGIN": ' + key.startsWith('-----BEGIN'));
  Logger.log('Заканчивается на "-----": ' + key.endsWith('-----'));
  Logger.log('Содержит настоящие переносы строк (\\n не как текст): ' + key.includes('\n'));

  try {
    const sig = Utilities.computeRsaSha256Signature('test', key);
    Logger.log('computeRsaSha256Signature сработал, длина подписи: ' + sig.length);
  } catch (err) {
    Logger.log('computeRsaSha256Signature упал: ' + err.message);
    return;
  }

  try {
    const token = getAccessToken_();
    Logger.log('Access token получен, длина: ' + token.length);
  } catch (err) {
    Logger.log('getAccessToken_ упал: ' + err.message);
  }
}

/**
 * Self-signed JWT сервис-аккаунта → access_token (OAuth2 service account
 * flow, без внешних библиотек). Кэшируется на 55 минут (токен живёт час).
 */
function getAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(TOKEN_CACHE_KEY);
  if (cached) return cached;

  const email = props_().getProperty('SERVICE_ACCOUNT_EMAIL');
  const privateKey = normalizePrivateKey_(props_().getProperty('SERVICE_ACCOUNT_PRIVATE_KEY'));
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: FIRESTORE_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url_(JSON.stringify(header))}.${base64url_(JSON.stringify(claim))}`;
  const signatureBytes = Utilities.computeRsaSha256Signature(signingInput, privateKey);
  const jwt = `${signingInput}.${base64url_(signatureBytes)}`;

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
    muteHttpExceptions: true,
  });
  const body = JSON.parse(resp.getContentText());
  if (!body.access_token) {
    throw new Error(`OAuth2 token exchange failed: ${resp.getContentText()}`);
  }
  cache.put(TOKEN_CACHE_KEY, body.access_token, 55 * 60);
  return body.access_token;
}

function fsRequest_(method, path, body) {
  const options = {
    method,
    headers: { Authorization: `Bearer ${getAccessToken_()}` },
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body !== undefined) options.payload = JSON.stringify(body);
  const resp = UrlFetchApp.fetch(`${firestoreBaseUrl_()}${path}`, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  const json = text ? JSON.parse(text) : null;
  if (code >= 400) {
    throw new Error(`Firestore ${method} ${path} → ${code}: ${text}`);
  }
  return json;
}

// --- Firestore value (de)serialization ---------------------------------

function toFsValue_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFsValue_) } };
  if (typeof v === 'object') return { mapValue: { fields: toFsFields_(v) } };
  return { stringValue: String(v) };
}

function toFsFields_(obj) {
  const fields = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) continue;
    fields[k] = toFsValue_(obj[k]);
  }
  return fields;
}

function fromFsValue_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFsValue_);
  if ('mapValue' in v) return fromFsDoc_({ fields: v.mapValue.fields || {} });
  return null;
}

function fromFsDoc_(doc) {
  const out = {};
  for (const k of Object.keys(doc.fields || {})) out[k] = fromFsValue_(doc.fields[k]);
  if (doc.name) out.id = doc.name.split('/').pop();
  return out;
}

// --- API key auth + rate limit ------------------------------------------

function sha256Hex_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
  return bytes.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/**
 * Проверяет ключ (по хэшу, apiKeys/{id}.revoked === false), применяет
 * rate limit per-key через CacheService (60 запросов/мин), обновляет
 * lastUsedAt. Возвращает {id, name, scope} или бросает {status, message}.
 */
function authenticate_(rawKey, requiredScope) {
  if (!rawKey) throw apiError_(401, 'Не передан apiKey.');
  const hash = sha256Hex_(rawKey);

  const result = runQuery_('apiKeys', [{ field: 'hash', op: 'EQUAL', value: hash }]);
  const keyDoc = result[0];
  if (!keyDoc || keyDoc.revoked) throw apiError_(401, 'Неверный или отозванный API-ключ.');

  const cache = CacheService.getScriptCache();
  const bucket = `rate:${keyDoc.id}:${Math.floor(Date.now() / 60000)}`;
  const count = Number(cache.get(bucket) || '0') + 1;
  cache.put(bucket, String(count), 70);
  if (count > RATE_LIMIT_PER_MINUTE) throw apiError_(429, `Превышен лимит ${RATE_LIMIT_PER_MINUTE} запросов/мин для этого ключа.`);

  const scopeOk =
    keyDoc.scope === 'read-write' ||
    keyDoc.scope === requiredScope ||
    (requiredScope === 'read' && keyDoc.scope === 'write'); // write подразумевает возможность читать своё же
  if (!scopeOk) throw apiError_(403, `Ключ "${keyDoc.name}" не имеет прав "${requiredScope}".`);

  fsRequest_('PATCH', `/apiKeys/${keyDoc.id}?updateMask.fieldPaths=lastUsedAt`, {
    fields: { lastUsedAt: { timestampValue: new Date().toISOString() } },
  });

  return keyDoc;
}

function apiError_(status, message) {
  const err = new Error(message);
  err.apiStatus = status;
  return err;
}

// --- structured query helper ---------------------------------------------

/**
 * @param {string} collectionId
 * @param {Array<{field:string, op:string, value:*}>} filters op — 'EQUAL' | 'GREATER_THAN' | 'LESS_THAN' | ...
 * @param {{limit?:number, orderBy?:{field:string,dir?:string}}} [opts]
 */
function runQuery_(collectionId, filters, opts) {
  opts = opts || {};
  const where =
    filters.length === 1
      ? { fieldFilter: { field: { fieldPath: filters[0].field }, op: filters[0].op, value: toFsValue_(filters[0].value) } }
      : {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((f) => ({
              fieldFilter: { field: { fieldPath: f.field }, op: f.op, value: toFsValue_(f.value) },
            })),
          },
        };

  const structuredQuery = {
    from: [{ collectionId }],
    where: filters.length ? where : undefined,
    limit: opts.limit,
  };
  if (opts.orderBy) {
    structuredQuery.orderBy = [{ field: { fieldPath: opts.orderBy.field }, direction: opts.orderBy.dir || 'ASCENDING' }];
  }

  const resp = fsRequest_('POST', ':runQuery', { structuredQuery });
  return (resp || [])
    .filter((r) => r.document)
    .map((r) => fromFsDoc_(r.document));
}

// --- lead helpers ----------------------------------------------------------

const LEAD_SOURCES = ['meta_target', 'target_manual', 'instagram', 'street', 'word_of_mouth', 'returned', 'other'];

function validateLeadInput_(body) {
  const fullName = (body.fullName || '').toString().trim();
  const phone = (body.phone || '').toString().replace(/\D/g, '');
  const phone2 = body.phone2 ? body.phone2.toString().replace(/\D/g, '') : '';
  if (!fullName) return 'Поле fullName обязательно.';
  if (!phone && !body.email) return 'Нужен phone или email.';
  if (body.source && !LEAD_SOURCES.includes(body.source)) {
    return `source должен быть одним из: ${LEAD_SOURCES.join(', ')}.`;
  }
  return null;
}

/**
 * Ищет активного за последние 24ч по phone/phone2 — дедуп при создании.
 * Сверяем по `apiSyncedAt` (реальный момент записи в CRM), НЕ по `createdAt` —
 * тот подменяется на `leadReceivedAt` из таблицы (см. createLead_) и может
 * быть сколь угодно старым при бэкфилле/задержке, из-за чего два ряда с
 * одним телефоном, засинканные подряд в один проход, не находили друг друга
 * (createdAt обоих — старый leadReceivedAt, «давно» относительно `since`).
 */
function findRecentDuplicate_(phone, phone2) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidates = [];
  if (phone) candidates.push(...runQuery_('students', [{ field: 'phone', op: 'EQUAL', value: phone }], { limit: 5 }));
  if (phone2) candidates.push(...runQuery_('students', [{ field: 'phone2', op: 'EQUAL', value: phone2 }], { limit: 5 }));
  return candidates.find((c) => c.apiSyncedAt && new Date(c.apiSyncedAt) >= since) || null;
}

/**
 * Работает ли оператор в указанный момент — то же самое, что
 * isOperatorWorkingAt в src/lib/leadFunnel.js, портировано вручную (общего
 * модуля между React и Apps Script рантаймами нет).
 */
function isOperatorWorkingAt_(workSchedule, date) {
  if (!workSchedule) return true;
  const today = workSchedule[date.getDay()];
  if (today === undefined) return true;
  if (today === null) return false;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const hhmm = hh + ':' + mm;
  return hhmm >= today.start && hhmm < today.end;
}

/**
 * Наименее загруженный из активных операторов — то же самое, что
 * assignLeastLoadedOperator в src/lib/leadFunnel.js (Настройки →
 * Распределение лидов). settings/{branchId}.activeLeadOperators не задан —
 * используем весь пул ceo/manager/admin этого филиала (тот же дефолт, что
 * в React-версии, чтобы поведение не расходилось до первой настройки).
 */
function nextLeastLoadedOperator_(branchId, createdAt) {
  const settings = fromFsDoc_(fsGetOptional_(`/settings/${branchId}`) || { fields: {} });
  let ids = settings.activeLeadOperators;
  if (!ids || !ids.length) {
    const operatorsResult = runQuery_(
      'staff',
      [
        { field: 'role', op: 'IN', value: ['ceo', 'manager', 'admin'] },
        { field: 'branchIds', op: 'ARRAY_CONTAINS', value: branchId },
      ],
      { limit: 30 },
    );
    ids = operatorsResult.map((s) => s.id);
  }
  if (!ids.length) return null;

  const schedules = settings.operatorSchedules || {};
  const onShiftIds = ids.filter((id) => isOperatorWorkingAt_(schedules[id], createdAt));
  const candidateIds = onShiftIds.length > 0 ? onShiftIds : ids;

  let best = null;
  let bestCount = Infinity;
  candidateIds.forEach((id) => {
    const leads = runQuery_(
      'students',
      [
        { field: 'assignedOperator', op: 'EQUAL', value: id },
        { field: 'funnelStage', op: 'IN', value: ['new', 'calling'] },
      ],
      { limit: 500 },
    );
    if (leads.length < bestCount) {
      bestCount = leads.length;
      best = id;
    }
  });
  return best;
}

function fsGetOptional_(path) {
  try {
    return fsRequest_('GET', path);
  } catch {
    return null;
  }
}

function createLead_(body) {
  const fullName = body.fullName.toString().trim();
  const phone = (body.phone || '').toString().replace(/\D/g, '') || null;
  const phone2 = body.phone2 ? body.phone2.toString().replace(/\D/g, '') : null;
  const branchId = body.branchId || defaultBranchId_();
  const russianLevel = body.russianLevel ? body.russianLevel.toString().trim() : null;
  const location = body.location ? body.location.toString().trim() : null;
  // Реальное время прихода лида (из Google Sheets) — если передано, кладём
  // как createdAt, чтобы SLA/приоритет считались от него, а не от момента,
  // когда Apps Script дозаписал строку в CRM (может быть позже).
  const leadReceivedAt = body.leadReceivedAt ? new Date(body.leadReceivedAt) : null;
  const effectiveCreatedAt = leadReceivedAt && !isNaN(leadReceivedAt) ? leadReceivedAt : new Date();

  const dup = findRecentDuplicate_(phone, phone2);
  if (dup) {
    const patch = {
      fullName,
      phone2: phone2 || dup.phone2 || null,
      source: body.source || dup.source || null,
      russianLevel: russianLevel || dup.russianLevel || null,
      location: location || dup.location || null,
      updatedAt: new Date(),
    };
    fsRequest_(
      'PATCH',
      `/students/${dup.id}?${Object.keys(patch).map((f) => `updateMask.fieldPaths=${f}`).join('&')}`,
      { fields: toFsFields_(patch) },
    );
    return { id: dup.id, merged: true };
  }

  const assignedOperator = nextLeastLoadedOperator_(branchId, effectiveCreatedAt);
  const doc = {
    fullName,
    phone,
    phone2,
    source: body.source || null,
    russianLevel,
    location,
    branchId,
    publicId: Math.floor(1000000 + Math.random() * 9000000),
    birthDate: null,
    gender: null,
    photoUrl: null,
    status: 'lead',
    statusReason: null,
    funnelStage: 'new',
    assignedOperator,
    stageHistory: [{ stage: 'new', enteredAt: effectiveCreatedAt }],
    balance: 0,
    balanceUpdatedAt: effectiveCreatedAt,
    note: '',
    isFlagged: false,
    activeGroupsCount: 0,
    firstPaymentAt: null,
    lastPaymentAt: null,
    trialAt: null,
    leftAt: null,
    createdAt: effectiveCreatedAt,
    apiSyncedAt: new Date(),
    createdBy: `api:${body.__apiKeyName || 'unknown'}`,
    isArchived: false,
    email: body.email || null,
  };
  const resp = fsRequest_('POST', '/students', { fields: toFsFields_(doc) });
  return { id: resp.name.split('/').pop(), merged: false };
}

function listLeads_(params) {
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = Math.min(100, Math.max(1, Number(params.per_page) || 20));

  const filters = [];
  if (params.status) filters.push({ field: 'funnelStage', op: 'EQUAL', value: params.status });
  if (params.source) filters.push({ field: 'source', op: 'EQUAL', value: params.source });

  // created_after/created_before требуют доп. фильтра на createdAt — Firestore
  // REST не даёт OFFSET/COUNT дёшево, поэтому пагинация здесь offset-based
  // (перечитывает limit*page документов) — приемлемо при объёме одной школы,
  // не рассчитано на десятки тысяч лидов.
  let all = runQuery_('students', filters.length ? filters : [{ field: 'status', op: 'EQUAL', value: 'lead' }], {
    limit: 1000,
    orderBy: { field: 'createdAt', dir: 'DESCENDING' },
  });
  if (params.created_after) all = all.filter((s) => s.createdAt && new Date(s.createdAt) >= new Date(params.created_after));
  if (params.created_before) all = all.filter((s) => s.createdAt && new Date(s.createdAt) <= new Date(params.created_before));

  const total = all.length;
  const start = (page - 1) * perPage;
  return { data: all.slice(start, start + perPage), page, per_page: perPage, total };
}

// --- HTTP entry points -----------------------------------------------------

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(fn) {
  try {
    return jsonOutput_(fn());
  } catch (err) {
    const status = err.apiStatus || 500;
    return jsonOutput_({ status, error: err.message || String(err) });
  }
}

function doPost(e) {
  return handle_(() => {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch {
      throw apiError_(400, 'Тело запроса должно быть валидным JSON.');
    }
    // apiKey читаем в первую очередь из query-параметра — Apps Script Web App
    // делает редирект script.google.com → script.googleusercontent.com, и
    // некоторые HTTP-клиенты (в т.ч. fetch с redirect:'follow') на этом
    // редиректе иногда не докидывают тело POST. Query-строка через редирект
    // не теряется никогда, поэтому она приоритетнее. См. API.md.
    const apiKey = (e.parameter && e.parameter.apiKey) || body.apiKey;

    if (body.action === 'update') {
      authenticate_(apiKey, 'write');
      if (!body.id) throw apiError_(400, 'Поле id обязательно.');
      const patch = { ...body };
      ['action', 'apiKey', 'id', 'branchId', 'createdBy', 'createdAt', 'publicId', '__apiKeyName'].forEach(
        (f) => delete patch[f],
      );
      patch.updatedAt = new Date();
      fsRequest_(
        'PATCH',
        `/students/${body.id}?${Object.keys(patch).map((f) => `updateMask.fieldPaths=${f}`).join('&')}`,
        { fields: toFsFields_(patch) },
      );
      return { status: 200, data: { id: body.id, updated: true } };
    }

    // action по умолчанию — create
    const key = authenticate_(apiKey, 'write');
    const validationError = validateLeadInput_(body);
    if (validationError) throw apiError_(400, validationError);
    body.__apiKeyName = key.name;
    Logger.log(`[leads-api] create от "${key.name}": ${body.fullName} / ${body.phone || body.email}`);
    const result = createLead_(body);
    return { status: 201, data: result };
  });
}

// --- Ежедневный отчёт по оператору → Telegram ------------------------------

/**
 * Окно отчёта у каждого оператора — «плавающее», привязано к концу ЕГО
 * смены (settings/{branchId}.operatorSchedules[opId][weekday].end), не к
 * фиксированному времени для всех. Пример: смена до 16:00 → окно данных
 * [15:50 вчера, 15:50 сегодня), отчёт уходит в 15:51. Логика:
 *   windowEnd = конец смены сегодня − REPORT_WINDOW_BEFORE_SHIFT_END_MIN
 *   windowStart = windowEnd − 24 часа
 *   sendAt = windowEnd + REPORT_SEND_DELAY_MIN
 * Триггер (checkAndSendDailyOperatorReports) должен быть установлен на
 * каждые REPORT_TRIGGER_TOLERANCE_MIN минут — Apps Script не гарантирует
 * секундную точность, поэтому окно допуска [sendAt, sendAt+tolerance)
 * ловит момент, даже если конкретный тик триггера пришёл на пару минут
 * позже расчётного sendAt.
 */
const REPORT_WINDOW_BEFORE_SHIFT_END_MIN = 10;
const REPORT_SEND_DELAY_MIN = 1;
const REPORT_TRIGGER_TOLERANCE_MIN = 5;
const REPORT_TARGET_SOURCES = ['meta_target', 'target_manual'];

function pad2_(n) {
  return String(n).padStart(2, '0');
}

function hhmmDdMm_(date) {
  return `${pad2_(date.getHours())}:${pad2_(date.getMinutes())} ${pad2_(date.getDate())}.${pad2_(date.getMonth() + 1)}`;
}

function telegramSendMessage_(text) {
  const chatId = props_().getProperty('TELEGRAM_CHAT_ID');
  const threadId = props_().getProperty('TELEGRAM_REPORTS_THREAD_ID');
  if (!chatId) {
    Logger.log('Telegram не настроен — нет TELEGRAM_CHAT_ID в Script Properties.');
    return;
  }
  telegramSendMessageTo_(chatId, threadId, text, 'HTML');
}

/** Общая отправка — используется и для отчётов, и для ответов на команды редактирования шаблона. */
function telegramSendMessageTo_(chatId, threadId, text, parseMode, replyMarkup) {
  const token = props_().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) {
    Logger.log('Telegram не настроен — нет TELEGRAM_BOT_TOKEN в Script Properties.');
    return;
  }
  const payload = { chat_id: chatId, text, parse_mode: parseMode || '' };
  if (threadId) payload.message_thread_id = Number(threadId);
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() >= 400) {
    Logger.log(`Telegram sendMessage упал (${resp.getResponseCode()}): ${resp.getContentText()}`);
  }
}

/** Убирает "часики" на нажатой inline-кнопке — Telegram требует ответить на каждый callback_query. */
function telegramAnswerCallback_(callbackQueryId, text) {
  const token = props_().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ callback_query_id: callbackQueryId, text: text || undefined }),
    muteHttpExceptions: true,
  });
}

/**
 * Шаблон текста отчёта — редактируется прямо из Telegram (см.
 * handleTelegramUpdate_ и installTelegramCommandPolling ниже), хранится в Script
 * Property REPORT_TEMPLATE как есть (со своими <b> и эмодзи), плейсхолдеры
 * вида {{name}} подставляются в renderReportTemplate_. Нет свойства —
 * используется REPORT_TEMPLATE_DEFAULT.
 */
const REPORT_TEMPLATE_DEFAULT =
  '📊 Отчёт за смену — <b>{{name}}</b>\n' +
  'Период: {{periodStart}} — {{periodEnd}}\n\n' +
  'Лидов поступило: <b>{{leads}}</b>\n' +
  'Взято в работу: <b>{{taken}}</b>\n' +
  'Потеряно: <b>{{lost}}</b>\n' +
  'Посетили (таргет): <b>{{target}}</b>\n' +
  'Посетили (другое): <b>{{other}}</b>\n' +
  'Новых оплат: <b>{{payments}}</b>';

function getReportTemplate_() {
  return props_().getProperty('REPORT_TEMPLATE') || REPORT_TEMPLATE_DEFAULT;
}

function renderReportTemplate_(vars) {
  return getReportTemplate_().replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

/**
 * Все 6 метрик считаются из ОДНОЙ выборки лидов оператора (assignedOperator
 * = opId, без фильтра по дате — Firestore REST не даёт дешёво фильтровать
 * по элементу массива типа callAttempts[0].at, поэтому тянем разумный
 * лимит и фильтруем на клиенте) — дешевле, чем 6 отдельных запросов, и то
 * же самое, чем уже пользуется nextLeastLoadedOperator_ выше в этом файле.
 * Платежи — отдельный запрос по transactions за окно (весь филиал, не
 * только этот оператор — так дешевле, чем IN по потенциально многим
 * studentId), сверяем studentId с набором лидов оператора.
 * @returns {string|null} текст отчёта, или null если оператор не был
 *   активен за окно (все метрики нулевые) — по нему отчёт не шлём.
 */
function buildOperatorReportText_(op, windowStart, windowEnd) {
  const leads = runQuery_('students', [{ field: 'assignedOperator', op: 'EQUAL', value: op.id }], { limit: 3000 });

  const inWindow = (iso) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= windowStart.getTime() && t < windowEnd.getTime();
  };

  const newLeadsCount = leads.filter((l) => inWindow(l.createdAt)).length;

  const takenCount = leads.filter((l) => {
    const attempts = l.callAttempts;
    return Array.isArray(attempts) && attempts[0] && inWindow(attempts[0].at);
  }).length;

  const lostCount = leads.filter((l) => l.funnelStage === 'lost' && inWindow(l.lostAt)).length;

  const attended = leads.filter((l) => l.attended === true && inWindow(l.trialDate));
  const attendedTargetCount = attended.filter((l) => REPORT_TARGET_SOURCES.includes(l.source)).length;
  const attendedOtherCount = attended.length - attendedTargetCount;

  const leadIds = new Set(leads.map((l) => l.id));
  const payments = runQuery_(
    'transactions',
    [
      { field: 'type', op: 'EQUAL', value: 'payment' },
      { field: 'date', op: 'GREATER_THAN_OR_EQUAL', value: windowStart },
      { field: 'date', op: 'LESS_THAN', value: windowEnd },
    ],
    { limit: 500 },
  );
  const newPaymentsCount = payments.filter((p) => leadIds.has(p.studentId)).length;

  const isActive = newLeadsCount || takenCount || lostCount || attendedTargetCount || attendedOtherCount || newPaymentsCount;
  if (!isActive) return null;

  return renderReportTemplate_({
    name: op.fullName,
    periodStart: hhmmDdMm_(windowStart),
    periodEnd: hhmmDdMm_(windowEnd),
    leads: newLeadsCount,
    taken: takenCount,
    lost: lostCount,
    target: attendedTargetCount,
    other: attendedOtherCount,
    payments: newPaymentsCount,
  });
}

/**
 * Раз в REPORT_TRIGGER_TOLERANCE_MIN минут (см. installDailyOperatorReportTrigger)
 * проверяет по каждому оператору филиала, не настал ли момент слать ему
 * отчёт (конец его смены сегодня минус 10 мин, плюс 1 мин), и если да —
 * считает метрики за 24ч перед этим моментом и шлёт в Telegram. Дедуп на
 * сегодня — через CacheService, чтобы несколько тиков триггера подряд не
 * отправили один отчёт дважды.
 */
function checkAndSendDailyOperatorReports() {
  const branchId = defaultBranchId_();
  const settingsDoc = fsGetOptional_(`/settings/${branchId}`);
  const schedules = (settingsDoc ? fromFsDoc_(settingsDoc) : {}).operatorSchedules || {};

  const operators = runQuery_(
    'staff',
    [
      { field: 'role', op: 'IN', value: ['ceo', 'manager', 'admin'] },
      { field: 'branchIds', op: 'ARRAY_CONTAINS', value: branchId },
    ],
    { limit: 30 },
  );

  const now = new Date();
  const cache = CacheService.getScriptCache();

  operators.forEach((op) => {
    const todaySchedule = schedules[op.id] && schedules[op.id][now.getDay()];
    if (!todaySchedule || !todaySchedule.end) return; // выходной или график не задан — не шлём

    const [endH, endM] = todaySchedule.end.split(':').map(Number);
    const shiftEndToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM);
    const windowEnd = new Date(shiftEndToday.getTime() - REPORT_WINDOW_BEFORE_SHIFT_END_MIN * 60000);
    const sendAt = new Date(windowEnd.getTime() + REPORT_SEND_DELAY_MIN * 60000);

    const diffMin = (now.getTime() - sendAt.getTime()) / 60000;
    if (diffMin < 0 || diffMin > REPORT_TRIGGER_TOLERANCE_MIN) return; // ещё рано, или окно допуска уже прошло

    const dateKey = `${now.getFullYear()}-${pad2_(now.getMonth() + 1)}-${pad2_(now.getDate())}`;
    const sentKey = `dailyReportSent_${op.id}_${dateKey}`;
    if (cache.get(sentKey)) return;
    cache.put(sentKey, '1', 6 * 60 * 60);

    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
    const text = buildOperatorReportText_(op, windowStart, windowEnd);
    if (text) telegramSendMessage_(text);
  });
}

/**
 * Разовая установка — запусти вручную (выбери installDailyOperatorReportTrigger
 * в выпадающем списке функций сверху редактора → Run) один раз после
 * настройки Script Properties. Безопасно перезапускать — сносит старые
 * триггеры с тем же именем перед созданием нового, дублей не будет.
 */
function installDailyOperatorReportTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'checkAndSendDailyOperatorReports')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkAndSendDailyOperatorReports').timeBased().everyMinutes(REPORT_TRIGGER_TOLERANCE_MIN).create();
  Logger.log(`Триггер установлен — проверка каждые ${REPORT_TRIGGER_TOLERANCE_MIN} мин.`);
}

/**
 * Отладка — считает отчёт для КАЖДОГО оператора прямо сейчас (окно 24ч до
 * текущего момента, не привязано к графику) и пишет в Execution log, БЕЗ
 * отправки в Telegram. Запускай вручную, чтобы проверить, что метрики
 * считаются правильно, до того как полагаться на реальный график/триггер.
 */
function previewDailyOperatorReports() {
  const branchId = defaultBranchId_();
  const operators = runQuery_(
    'staff',
    [
      { field: 'role', op: 'IN', value: ['ceo', 'manager', 'admin'] },
      { field: 'branchIds', op: 'ARRAY_CONTAINS', value: branchId },
    ],
    { limit: 30 },
  );
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
  operators.forEach((op) => {
    const text = buildOperatorReportText_(op, windowStart, windowEnd);
    Logger.log(text ? `\n${text}` : `${op.fullName}: не активен за последние 24ч, отчёт не шлём.`);
  });
}

// --- Редактирование шаблона отчёта прямо из Telegram ------------------------

const TEMPLATE_PLACEHOLDER_HINT =
  'Плейсхолдеры: {{name}} {{periodStart}} {{periodEnd}} {{leads}} {{taken}} {{lost}} {{target}} {{other}} {{payments}}';

const TEMPLATE_MENU_KEYBOARD = {
  inline_keyboard: [
    [
      { text: '👁 Показать шаблон', callback_data: 'tpl_get' },
      { text: '✏️ Изменить шаблон', callback_data: 'tpl_set' },
    ],
    [{ text: '♻️ Сбросить на стандартный', callback_data: 'tpl_reset' }],
  ],
};

/**
 * "Жду следующее сообщение как новый текст шаблона" — короткоживущее
 * состояние на пару минут после нажатия "Изменить шаблон", отдельно на
 * каждого пишущего (chatId:threadId:fromId), чтобы не путать разных людей
 * в одной группе. CacheService, не Script Properties — ему и положено
 * само-истекать, ничего убирать вручную не нужно.
 */
function pendingEditKey_(chatId, threadId, fromId) {
  return `tplEditPending_${chatId}_${threadId || 0}_${fromId}`;
}

/**
 * Входящий Telegram Update — текстовые команды и нажатия inline-кнопок
 * меню управления шаблоном отчёта. Вызывается из doPost, когда апдейт
 * пришёл от Telegram webhook, а не от leads API. Если задан
 * ADMIN_TELEGRAM_USER_ID — работает только от него (сравнение с from.id);
 * если свойство не задано — редактировать шаблон может кто угодно, кто
 * пишет боту (осознанно открыто сейчас, можно закрыть в любой момент,
 * просто задав это свойство).
 */
function handleTelegramUpdate_(update) {
  const adminId = props_().getProperty('ADMIN_TELEGRAM_USER_ID');

  if (update.callback_query) {
    const cq = update.callback_query;
    if (adminId && String(cq.from.id) !== String(adminId)) {
      telegramAnswerCallback_(cq.id, 'Нет доступа.');
      return;
    }
    const chatId = cq.message.chat.id;
    const threadId = cq.message.message_thread_id;
    const cache = CacheService.getScriptCache();

    if (cq.data === 'tpl_get') {
      telegramAnswerCallback_(cq.id);
      telegramSendMessageTo_(chatId, threadId, `Текущий шаблон:\n\n${getReportTemplate_()}\n\n${TEMPLATE_PLACEHOLDER_HINT}`, '', TEMPLATE_MENU_KEYBOARD);
      return;
    }
    if (cq.data === 'tpl_reset') {
      props_().deleteProperty('REPORT_TEMPLATE');
      telegramAnswerCallback_(cq.id, 'Шаблон сброшен.');
      telegramSendMessageTo_(chatId, threadId, `Шаблон сброшен на стандартный:\n\n${REPORT_TEMPLATE_DEFAULT}`, '', TEMPLATE_MENU_KEYBOARD);
      return;
    }
    if (cq.data === 'tpl_set') {
      cache.put(pendingEditKey_(chatId, threadId, cq.from.id), '1', 600); // 10 мин на ответ
      telegramAnswerCallback_(cq.id);
      telegramSendMessageTo_(chatId, threadId, `Пришли следующим сообщением новый текст целиком.\n\n${TEMPLATE_PLACEHOLDER_HINT}`);
      return;
    }
    return;
  }

  const message = update.message;
  if (!message || !message.text) return;
  if (adminId && String(message.from.id) !== String(adminId)) return;

  const chatId = message.chat.id;
  const threadId = message.message_thread_id;
  const text = message.text.trim();

  if (text === '/start' || text === '/gettemplate' || text === '/menu') {
    telegramSendMessageTo_(chatId, threadId, `Текущий шаблон:\n\n${getReportTemplate_()}\n\n${TEMPLATE_PLACEHOLDER_HINT}`, '', TEMPLATE_MENU_KEYBOARD);
    return;
  }

  if (text === '/resettemplate') {
    props_().deleteProperty('REPORT_TEMPLATE');
    telegramSendMessageTo_(chatId, threadId, `Шаблон сброшен на стандартный:\n\n${REPORT_TEMPLATE_DEFAULT}`, '', TEMPLATE_MENU_KEYBOARD);
    return;
  }

  if (text.indexOf('/settemplate') === 0) {
    const newTemplate = text.slice('/settemplate'.length).trim();
    if (!newTemplate) {
      telegramSendMessageTo_(chatId, threadId, 'Пусто — пришли /settemplate и на следующей строке текст шаблона.');
      return;
    }
    props_().setProperty('REPORT_TEMPLATE', newTemplate);
    telegramSendMessageTo_(chatId, threadId, `Шаблон сохранён:\n\n${newTemplate}`, '', TEMPLATE_MENU_KEYBOARD);
    return;
  }

  // Ждём текст шаблона после нажатия "Изменить шаблон" — принимаем как есть,
  // без команды-префикса, и снимаем ожидание сразу, независимо от исхода.
  const cache = CacheService.getScriptCache();
  const pendingKey = pendingEditKey_(chatId, threadId, message.from.id);
  if (cache.get(pendingKey)) {
    cache.remove(pendingKey);
    props_().setProperty('REPORT_TEMPLATE', text);
    telegramSendMessageTo_(chatId, threadId, `Шаблон сохранён:\n\n${text}`, '', TEMPLATE_MENU_KEYBOARD);
  }
}

/**
 * Опрос команд Telegram (не webhook) — Apps Script Web App всегда отдаёт
 * первый ответ как 302-редирект (script.google.com →
 * script.googleusercontent.com), а Telegram при доставке через webhook эту
 * редиректную цепочку не проходит и репортит «Wrong response from the
 * webhook: 302 Found» — сам doPost с апдейтом при этом даже не успевает
 * выполниться. Поэтому — тот же паттерн, что и у SheetsSync.gs: Apps
 * Script сам стучится в Telegram по таймеру (тут Apps Script — клиент,
 * редирект ему не мешает, UrlFetchApp следует за ним сам).
 * Оффсет — Script Property TELEGRAM_LAST_UPDATE_ID, чтобы не обрабатывать
 * одни и те же апдейты повторно между тиками триггера.
 */
function checkTelegramCommands_() {
  const token = props_().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  const offset = Number(props_().getProperty('TELEGRAM_LAST_UPDATE_ID') || 0);
  const resp = UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=0`, {
    muteHttpExceptions: true,
  });
  const json = JSON.parse(resp.getContentText());
  if (!json.ok) {
    Logger.log(`[telegram-poll] getUpdates упал: ${resp.getContentText()}`);
    return;
  }
  let maxId = offset - 1;
  json.result.forEach((update) => {
    try {
      handleTelegramUpdate_(update);
    } catch (err) {
      Logger.log(`[telegram-poll] ${err.message || err}`);
    }
    if (update.update_id > maxId) maxId = update.update_id;
  });
  if (maxId >= offset) props_().setProperty('TELEGRAM_LAST_UPDATE_ID', String(maxId + 1));
}

/**
 * Разовая настройка — запусти один раз (Run из редактора). Снимает webhook,
 * если он был поставлен раньше (getUpdates и webhook несовместимы —
 * Telegram отдаст 409, пока webhook висит), и ставит триггер опроса
 * команд раз в минуту.
 * ADMIN_TELEGRAM_USER_ID не обязателен — без него редактировать шаблон
 * (см. handleTelegramUpdate_) сможет кто угодно, кто напишет боту; задай
 * это свойство, когда захочешь ограничить только собой.
 */
function installTelegramCommandPolling() {
  const token = props_().getProperty('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN не задан в Script Properties.');
  UrlFetchApp.fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, { muteHttpExceptions: true });
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'checkTelegramCommands_')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('checkTelegramCommands_').timeBased().everyMinutes(1).create();
  Logger.log('Опрос команд Telegram запущен — раз в минуту.');
}

function doGet(e) {
  return handle_(() => {
    const params = e.parameter || {};
    const action = params.action || 'list';

    if (action === 'get') {
      authenticate_(params.apiKey, 'read');
      if (!params.id) throw apiError_(400, 'Параметр id обязателен.');
      const doc = fsGetOptional_(`/students/${params.id}`);
      if (!doc) throw apiError_(404, 'Лид не найден.');
      return { status: 200, data: fromFsDoc_(doc) };
    }

    authenticate_(params.apiKey, 'read');
    return { status: 200, ...listLeads_(params) };
  });
}
