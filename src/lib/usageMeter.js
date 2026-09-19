// src/lib/usageMeter.js
import { doc, setDoc, increment, serverTimestamp } from '@firebase/firestore';

/**
 * Счётчик чтений Firestore для раздела «Расход Firebase» в настройках.
 * Считает документы, которые приложение получило от сервера (обёртки над
 * onSnapshot/getDocs/getDoc/getCountFromServer в firestoreMetered.js) —
 * без данных из локального кэша, они не тарифицируются. Копит в памяти и раз в
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

const emptyBatch = () => ({ total: 0, byLabel: {}, byHour: {} });
let pending = emptyBatch();
let dbRef = null;
let started = false;

/** Записать n прочитанных документов (раздел — по текущему адресу страницы). */
export function recordReads(n) {
  if (!n || n < 0) return;
  const section = currentSection();
  const hour = String(new Date().getHours());
  pending.total += n;
  pending.byLabel[section] = (pending.byLabel[section] ?? 0) + n;
  pending.byHour[hour] = (pending.byHour[hour] ?? 0) + n;
}

const incrementAll = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, increment(v)]));

/** id документа-счётчика за сутки квоты в коллекции settings. */
export const usageDocId = (dayKey = quotaDayKey()) => `usage_${dayKey}`;

/** Отправить накопленное в settings/usage_{день}. Одна запись, только если есть что отправлять. */
export async function flushUsage() {
  if (!dbRef || pending.total === 0) return;
  const batch = pending;
  pending = emptyBatch();
  try {
    await setDoc(
      doc(dbRef, 'settings', usageDocId()),
      { reads: increment(batch.total), byLabel: incrementAll(batch.byLabel), byHour: incrementAll(batch.byHour), updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    // у учителей нет права писать в settings — их чтения просто не считаем
    if (err?.code === 'permission-denied') return;
    // не записалось (нет сети) — вернём в очередь, отправим со следующим разом
    pending.total += batch.total;
    for (const [k, v] of Object.entries(batch.byLabel)) pending.byLabel[k] = (pending.byLabel[k] ?? 0) + v;
    for (const [k, v] of Object.entries(batch.byHour)) pending.byHour[k] = (pending.byHour[k] ?? 0) + v;
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
