// src/lib/usageMeter.js
import { doc, setDoc, increment, serverTimestamp } from '@firebase/firestore';

/**
 * Счётчик чтений/записей/удалений Firestore для раздела «Лимиты и расход» в настройках.
 * Читает документы, которые приложение получило от сервера (обёртки над
 * onSnapshot/getDocs/getDoc/getCountFromServer в firestoreMetered.js) —
 * без данных из локального кэша, они не тарифицируются; записи и удаления —
 * setDoc/addDoc/updateDoc/deleteDoc/writeBatch/runTransaction. Копит в памяти и раз в
 * 5 минут одной записью добавляет в `settings/usage_{день квоты}` (общий счётчик по
 * всем пользователям; в `settings`, чтобы не менять правила безопасности —
 * писать туда могут ceo/manager/admin/test, чтения учителей не попадут в счёт). Это ПРИБЛИЗИТЕЛЬНАЯ оценка только по этому приложению: чтения
 * скриптов, консоли Firebase и правил безопасности сюда не входят — точный итог
 * всегда в консоли Firebase.
 *
 * Импортирует firestore напрямую из '@firebase/firestore' (не из
 * 'firebase/firestore'): на 'firebase/firestore' в vite.config стоит алиас на
 * firestoreMetered.js, иначе был бы цикл.
 */
export const FREE_DAILY_READS = 50_000;
const FLUSH_MS = 5 * 60_000;

/** Разделы приложения → подпись в отчёте. */
export const SECTION_LABELS = {
  dashboard: 'Дашборд',
  tasks: 'Задачи',
  leads: 'Заявки',
  trials: 'Пробные',
  students: 'Студенты',
  groups: 'Учителя и группы',
  payments: 'Финансы',
  reports: 'Отчёты и статистика',
  settings: 'Настройки',
  other: 'Прочее',
};

/** Сутки квоты Firestore заканчиваются в полночь по тихоокеанскому времени (12:00 в Ташкенте). */
export function quotaDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Сколько миллисекунд до сброса квоты. */
export function msUntilQuotaReset(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(now);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (86_400 - (get('hour') * 3600 + get('minute') * 60 + get('second'))) * 1000;
}

function currentSection() {
  const path = (window.location.hash || '').replace(/^#/, '').split('?')[0];
  if (path === '' || path === '/') return 'dashboard';
  const first = path.split('/')[1];
  if (first === 'teachers-groups' || first === 'groups' || first === 'teachers' || first === 'courses' || first === 'rooms') return 'groups';
  return first in SECTION_LABELS ? first : 'other';
}

const emptyBatch = () => ({ reads: 0, writes: 0, deletes: 0, byLabel: {}, wByLabel: {}, byHour: {} });
let pending = emptyBatch();
let dbRef = null;
let started = false;

const bump = (map, key, n) => {
  map[key] = (map[key] ?? 0) + n;
};

/** Записать n прочитанных документов (раздел — по текущему адресу страницы). */
export function recordReads(n) {
  if (!n || n < 0) return;
  pending.reads += n;
  bump(pending.byLabel, currentSection(), n);
  bump(pending.byHour, String(new Date().getHours()), n);
}

/** Записать n записанных (writes) и m удалённых (deletes) документов — их суточные лимиты у Spark по 20 000. */
export function recordWrites(n, m = 0) {
  if (n > 0) {
    pending.writes += n;
    bump(pending.wByLabel, currentSection(), n);
  }
  if (m > 0) pending.deletes += m;
}

const incrementAll = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, increment(v)]));

/** id документа-счётчика за сутки квоты в коллекции settings. */
export const usageDocId = (dayKey = quotaDayKey()) => `usage_${dayKey}`;

/** id документа со счётчиками Apps Script (их пишет Code.gs, см. appsscript/Code.gs → flushUsage_). */
export const appsUsageDocId = (dayKey = quotaDayKey()) => `appsusage_${dayKey}`;

const hasPending = (b) => b.reads + b.writes + b.deletes > 0;

/** Отправить накопленное в settings/usage_{день}. Одна запись, только если есть что отправлять. */
export async function flushUsage() {
  if (!dbRef || !hasPending(pending)) return;
  const batch = pending;
  pending = emptyBatch();
  const data = { updatedAt: serverTimestamp() };
  if (batch.reads) Object.assign(data, { reads: increment(batch.reads), byLabel: incrementAll(batch.byLabel), byHour: incrementAll(batch.byHour) });
  if (batch.writes) Object.assign(data, { writes: increment(batch.writes), wByLabel: incrementAll(batch.wByLabel) });
  if (batch.deletes) data.deletes = increment(batch.deletes);
  try {
    await setDoc(doc(dbRef, 'settings', usageDocId()), data, { merge: true });
  } catch (err) {
    // у учителей нет права писать в settings — их счётчики просто не ведутся
    if (err?.code === 'permission-denied') return;
    // не записалось (нет сети) — вернём в очередь, отправим со следующим разом
    pending.reads += batch.reads;
    pending.writes += batch.writes;
    pending.deletes += batch.deletes;
    for (const [k, v] of Object.entries(batch.byLabel)) bump(pending.byLabel, k, v);
    for (const [k, v] of Object.entries(batch.wByLabel)) bump(pending.wByLabel, k, v);
    for (const [k, v] of Object.entries(batch.byHour)) bump(pending.byHour, k, v);
  }
}

/** Вызывается один раз из firebase.js после создания db. */
export function initUsageMeter(db) {
  dbRef = db;
  if (started || typeof window === 'undefined') return;
  started = true;
  setInterval(flushUsage, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushUsage();
  });
}
