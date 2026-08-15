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

const LEAD_SOURCES = ['instagram', 'telegram', 'friends', 'outdoor', 'other'];

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

/** Ищет активного за последние 24ч по phone/phone2 — дедуп при создании. */
function findRecentDuplicate_(phone, phone2) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidates = [];
  if (phone) candidates.push(...runQuery_('students', [{ field: 'phone', op: 'EQUAL', value: phone }], { limit: 5 }));
  if (phone2) candidates.push(...runQuery_('students', [{ field: 'phone2', op: 'EQUAL', value: phone2 }], { limit: 5 }));
  return candidates.find((c) => c.createdAt && new Date(c.createdAt) >= since) || null;
}

/**
 * Наименее загруженный из активных операторов — то же самое, что
 * assignLeastLoadedOperator в src/lib/leadFunnel.js (Настройки →
 * Распределение лидов). settings/{branchId}.activeLeadOperators не задан —
 * используем весь пул ceo/manager/admin этого филиала (тот же дефолт, что
 * в React-версии, чтобы поведение не расходилось до первой настройки).
 */
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
