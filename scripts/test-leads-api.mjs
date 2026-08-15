/**
 * Дымовой тест API приёма/выдачи лидов (appsscript/Code.gs). Не unit-тест —
 * в проекте нет тестового фреймворка (ни во фронтенде, ни в Apps Script),
 * поэтому это скрипт, бьющий по уже задеплоенному Web App URL и проверяющий
 * реальные сценарии: успешное создание, невалидные данные, неверный ключ,
 * дублирующийся лид.
 *
 *   node scripts/test-leads-api.mjs <WEB_APP_URL> <API_KEY>
 *
 * WEB_APP_URL — вида https://script.google.com/macros/s/AKfycb.../exec
 * API_KEY — ключ со scope write (см. scripts/manage-api-keys.mjs).
 */
const [, , webAppUrl, apiKey] = process.argv;
if (!webAppUrl || !apiKey) {
  console.error('Использование: node scripts/test-leads-api.mjs <WEB_APP_URL> <API_KEY>');
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`OK   ${label}`);
    passed += 1;
  } else {
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
    failed += 1;
  }
}

async function post(body) {
  // apiKey — query-параметром, не только в теле: Apps Script Web App иногда
  // теряет POST-тело на редиректе google.com → googleusercontent.com,
  // query-строка через редирект не теряется. См. Code.gs / API.md.
  const url = body.apiKey ? `${webAppUrl}?${new URLSearchParams({ apiKey: body.apiKey }).toString()}` : webAppUrl;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    body: JSON.stringify(body),
  });
  return res.json();
}

async function get(params) {
  const url = `${webAppUrl}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { redirect: 'follow' });
  return res.json();
}

const uniquePhone = `99890${Date.now().toString().slice(-7)}`;

// 1. Успешное создание
const created = await post({ apiKey, fullName: 'Тест API Смоук', phone: uniquePhone, source: 'other' });
check('create: status 201', created.status === 201, JSON.stringify(created));
check('create: вернулся id', Boolean(created.data?.id), JSON.stringify(created));

// 2. Невалидные данные — нет имени
const invalid = await post({ apiKey, phone: '998900000000' });
check('validation: status 400 без fullName', invalid.status === 400, JSON.stringify(invalid));

// 3. Неверный ключ
const badKey = await post({ apiKey: 'sk_live_not_a_real_key', fullName: 'X', phone: '998900000001' });
check('auth: status 401 при неверном ключе', badKey.status === 401, JSON.stringify(badKey));

// 4. Дублирующийся лид (тот же телефон второй раз за 24ч → merge, не новый id)
const duplicate = await post({ apiKey, fullName: 'Тест API Смоук (повтор)', phone: uniquePhone, source: 'other' });
check('dedup: merged=true', duplicate.data?.merged === true, JSON.stringify(duplicate));
check('dedup: тот же id, что при создании', duplicate.data?.id === created.data?.id, JSON.stringify(duplicate));

// 5. GET list с фильтром по source
const list = await get({ apiKey, action: 'list', source: 'other', per_page: 5 });
check('list: status 200', list.status === 200, JSON.stringify(list));
check('list: data — массив', Array.isArray(list.data), JSON.stringify(list));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
