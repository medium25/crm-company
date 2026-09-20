import { useEffect, useMemo, useReducer } from 'react';
import { collection, doc, query, where, orderBy, limit, documentId } from 'firebase/firestore';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { db, firebaseConfig } from '../../firebase.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { SECTION_LABELS, flushUsage, quotaDayKey, msUntilQuotaReset, usageDocId, appsUsageDocId } from '../../lib/usageMeter.js';

const nf = new Intl.NumberFormat('ru-RU');
const fmt = (n) => nf.format(Math.round(n ?? 0));

// ---- Лимиты ---------------------------------------------------------------------------------
// Firebase — бесплатный тариф Spark; Apps Script — личный аккаунт Google (у Workspace лимиты выше).
// Значения — из документации Google на момент написания; менять только здесь.
const FIRESTORE_LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 };
const APPS_LIMITS = { fetches: 20_000, triggerMinutes: 90 };

/** Лимиты без счётчика в системе — показываем справочно и ведём в консоль. */
const FIREBASE_STATIC = [
  { label: 'Хранилище Firestore', value: '1 ГиБ' },
  { label: 'Исходящий трафик Firestore', value: '10 ГиБ в месяц' },
  { label: 'Cloud Storage (файлы)', value: '5 ГБ хранилища, 1 ГБ скачивания в сутки' },
  { label: 'Аутентификация', value: 'без ограничений по входам; СМС-верификация — 10 в сутки' },
];
const APPS_STATIC = [
  { label: 'Время одного запуска', value: '6 минут' },
  { label: 'Одновременных запусков', value: '30' },
  { label: 'Триггеров на один скрипт', value: '20' },
  { label: 'Получателей писем в сутки', value: '100 (почту система не шлёт)' },
  { label: 'Чтения/записи Script Properties', value: '50 000 в сутки' },
  { label: 'Размер ответа UrlFetch', value: '50 МБ' },
];

/** Кто в Apps Script что тратит (ключи — см. appsscript/Code.gs, trackedRun_). */
const FN_LABELS = {
  trg_sync: { title: 'Синхронизатор таблицы → CRM', kind: 'триггер', hint: 'раз в минуту' },
  trg_export: { title: 'Экспорт лидов → таблица', kind: 'триггер', hint: 'раз в сутки' },
  trg_telegram: { title: 'Опрос команд Telegram', kind: 'триггер', hint: 'раз в 10 минут' },
  trg_reports: { title: 'Отчёты операторам', kind: 'триггер', hint: 'раз в 5 минут' },
  web_api: { title: 'API лидов (веб-приложение)', kind: 'веб', hint: 'по запросам' },
  web_export_hook: { title: 'Webhook статуса → таблица', kind: 'веб', hint: 'при смене стадии' },
  web_usage_flush: { title: 'Отправка этого учёта', kind: 'веб', hint: 'раз в 10 минут' },
};

const toneOf = (pct) => (pct >= 90 ? '#E11D48' : pct >= 60 ? '#E5842B' : '#4364C3');
const verdict = (pct) =>
  pct >= 100 ? 'Лимит превышен — запросы могут отклоняться.' : pct >= 90 ? 'Почти весь лимит израсходован.' : pct >= 60 ? 'Больше половины лимита.' : 'В пределах лимита.';

function Bar({ pct, color = '#4364C3', height = 'h-2' }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-border ${height}`}>
      <div className={`${height} rounded-full`} style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

/** Одна квота со шкалой: «использовано из лимита» + пояснение, чем измерено. */
function QuotaRow({ label, used, limitValue, unit = '', note, formatValue = fmt }) {
  const pct = limitValue > 0 ? (used / limitValue) * 100 : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-bold text-text">{label}</span>
        <span className="text-muted">
          <span className="font-bold text-text">{formatValue(used)}</span> из {formatValue(limitValue)}
          {unit ? ` ${unit}` : ''} · {pct.toFixed(1)}%
        </span>
      </div>
      <Bar pct={pct} color={toneOf(pct)} height="h-3" />
      <p className="mt-1 text-[12px]" style={{ color: toneOf(pct) }}>
        {verdict(pct)} {note ? <span className="text-muted">{note}</span> : null}
      </p>
    </div>
  );
}

function StaticRows({ rows, consoleUrl, consoleLabel }) {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <p className="mb-1.5 text-[12px] font-bold uppercase text-muted">Остальные лимиты — справочно, приложение их не считает</p>
      <div className="flex flex-col divide-y divide-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
            <span className="text-text">{r.label}</span>
            <span className="text-right text-muted">{r.value}</span>
          </div>
        ))}
      </div>
      <a href={consoleUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-field bg-navy px-4 py-1.5 text-[13px] font-bold text-white hover:bg-navy-hover">
        {consoleLabel} <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

/** Сумма поля по всем функциям Apps Script (опционально — только по подходящим ключам). */
const sumFn = (byFn, field, pick = () => true) =>
  Object.entries(byFn ?? {}).reduce((acc, [key, v]) => (pick(key) ? acc + (v?.[field] ?? 0) : acc), 0);

const formatDuration = (ms) => {
  const totalSec = Math.round((ms ?? 0) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m} мин ${String(s).padStart(2, '0')} с` : `${s} с`;
};

const ageLabel = (ts) => {
  const ms = ts?.toMillis?.();
  if (!ms) return null;
  const min = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return min < 1 ? 'только что' : min < 60 ? `${min} мин назад` : `${Math.round(min / 60)} ч назад`;
};

/**
 * Настройки → «Лимиты и расход». Показывает суточные квоты Firebase (Firestore, тариф Spark) и Apps Script
 * (личный аккаунт) и то, как их тратит система:
 *  • Firestore: чтения/записи/удаления приложения (счётчик в браузерах, usageMeter.js) + операции, которые
 *    делает Apps Script (Code.gs шлёт свои счётчики в settings/appsusage_{сутки});
 *  • Apps Script: запросы UrlFetch и время триггеров — считают сами скрипты (appsscript/*.gs) и присылают раз в 10 минут.
 * Это оценка «изнутри», точные итоги — в консолях Firebase и Apps Script (кнопки ниже).
 */
export function FirebaseUsageTab() {
  const [, tick] = useReducer((n) => n + 1, 0);
  const dayKey = quotaDayKey();

  useEffect(() => {
    flushUsage();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const appRef = useMemo(() => (db ? doc(db, 'settings', usageDocId(dayKey)) : null), [dayKey]);
  const appsRef = useMemo(() => (db ? doc(db, 'settings', appsUsageDocId(dayKey)) : null), [dayKey]);
  const { data: app, loading } = useDoc(appRef);
  const { data: apps } = useDoc(appsRef);

  const historyQuery = (prefix) =>
    db ? query(collection(db, 'settings'), where(documentId(), '>=', prefix), where(documentId(), '<', `${prefix}`), orderBy(documentId(), 'desc'), limit(8)) : null;
  const appHistoryQuery = useMemo(() => historyQuery('usage_'), []);
  const appsHistoryQuery = useMemo(() => historyQuery('appsusage_'), []);
  const { data: appHistory } = useCollection(appHistoryQuery);
  const { data: appsHistory } = useCollection(appsHistoryQuery);

  const resetMs = msUntilQuotaReset();
  const resetAt = format(new Date(Date.now() + resetMs), 'HH:mm');
  const resetText = `Сброс в ${resetAt} (Ташкент), через ${Math.floor(resetMs / 3_600_000)} ч ${String(Math.floor((resetMs % 3_600_000) / 60_000)).padStart(2, '0')} мин`;

  const byFn = apps?.byFn ?? {};
  const appsReads = sumFn(byFn, 'reads');
  const appsWrites = sumFn(byFn, 'writes');
  const reads = (app?.reads ?? 0) + appsReads;
  const writes = (app?.writes ?? 0) + appsWrites;
  const deletes = app?.deletes ?? 0;
  const fetches = sumFn(byFn, 'fetches');
  const triggerMs = sumFn(byFn, 'ms', (k) => k.startsWith('trg_'));
  const totalRuns = sumFn(byFn, 'runs');
  const totalErrors = sumFn(byFn, 'errors');

  const sections = Object.entries(app?.byLabel ?? {})
    .map(([key, n]) => ({ key, n, label: SECTION_LABELS[key] ?? key }))
    .sort((a, b) => b.n - a.n);
  const writeSections = Object.entries(app?.wByLabel ?? {})
    .map(([key, n]) => ({ key, n, label: SECTION_LABELS[key] ?? key }))
    .sort((a, b) => b.n - a.n);
  const fnRows = Object.entries(byFn)
    .map(([key, v]) => ({ key, ...(FN_LABELS[key] ?? { title: key, kind: '', hint: '' }), ...v }))
    .sort((a, b) => (b.fetches ?? 0) - (a.fetches ?? 0) || (b.ms ?? 0) - (a.ms ?? 0));

  const hours = Array.from({ length: 24 }, (_, i) => (12 + i) % 24);
  const byHour = hours.map((h) => ({ h, n: app?.byHour?.[String(h)] ?? 0 }));
  const maxHour = Math.max(1, ...byHour.map((x) => x.n));

  const history = useMemo(() => {
    const days = new Map();
    const dayOf = (id, prefix) => id.replace(prefix, '');
    appHistory.forEach((d) => days.set(dayOf(d.id, 'usage_'), { ...(days.get(dayOf(d.id, 'usage_')) ?? {}), reads: d.reads ?? 0, writes: d.writes ?? 0, deletes: d.deletes ?? 0 }));
    appsHistory.forEach((d) => {
      const fn = d.byFn ?? {};
      const cur = days.get(dayOf(d.id, 'appsusage_')) ?? {};
      days.set(dayOf(d.id, 'appsusage_'), {
        ...cur,
        reads: (cur.reads ?? 0) + sumFn(fn, 'reads'),
        writes: (cur.writes ?? 0) + sumFn(fn, 'writes'),
        fetches: sumFn(fn, 'fetches'),
        triggerMs: sumFn(fn, 'ms', (k) => k.startsWith('trg_')),
      });
    });
    return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  }, [appHistory, appsHistory]);

  const firebaseConsole = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/-default-/usage`;
  const appsConsole = 'https://script.google.com/home/executions';
  const appsAge = ageLabel(apps?.updatedAt);

  if (loading) return <Skeleton className="h-64 w-full rounded-card" />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="text-[15px] font-bold text-text">Суточные квоты и как их тратит система</p>
        <p className="mt-1 text-[13px] text-muted">
          Квоты Firebase и Apps Script считаются по суткам, которые заканчиваются в полночь по Тихому океану. {resetText}. Цифры ниже — оценка самой системы:
          точные итоги показывают консоли (кнопки в каждом блоке).
        </p>
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">Firebase — Firestore (тариф Spark)</p>
        <div className="flex flex-col gap-4">
          <QuotaRow
            label="Чтения документов"
            used={reads}
            limitValue={FIRESTORE_LIMITS.reads}
            note={`Приложение ${fmt(app?.reads)} + Apps Script ${fmt(appsReads)}. Данные из кэша браузера не считаются.`}
          />
          <QuotaRow
            label="Записи документов"
            used={writes}
            limitValue={FIRESTORE_LIMITS.writes}
            note={`Приложение ${fmt(app?.writes)} + Apps Script ${fmt(appsWrites)}.`}
          />
          <QuotaRow label="Удаления документов" used={deletes} limitValue={FIRESTORE_LIMITS.deletes} note="Только из приложения." />
        </div>
        <StaticRows rows={FIREBASE_STATIC} consoleUrl={firebaseConsole} consoleLabel="Точные цифры в консоли Firebase" />
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">Apps Script (личный аккаунт Google)</p>
        <div className="flex flex-col gap-4">
          <QuotaRow
            label="Запросы UrlFetch"
            used={fetches}
            limitValue={APPS_LIMITS.fetches}
            note="Считают сами скрипты. Исчерпание — «Service invoked too many times for one day: urlfetch»."
          />
          <QuotaRow
            label="Суммарное время триггеров"
            used={triggerMs / 60000}
            limitValue={APPS_LIMITS.triggerMinutes}
            unit="мин"
            formatValue={(v) => (Math.round(v * 10) / 10).toLocaleString('ru-RU')}
            note="Только запуски по таймеру; веб-приложение (API) сюда не входит."
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
            <span>Запусков за сутки: <b className="text-text">{fmt(totalRuns)}</b></span>
            <span>Ошибок: <b className={totalErrors > 0 ? 'text-danger' : 'text-text'}>{fmt(totalErrors)}</b></span>
            <span>Данные скриптов: <b className="text-text">{appsAge ?? 'ещё не приходили'}</b></span>
          </div>
          {!apps && (
            <p className="rounded-field bg-surface-alt px-3 py-2 text-[12px] text-muted">
              Скрипты Apps Script ещё не прислали счётчики: вставь обновлённые Code.gs, SheetsSync.gs и SheetsExport.gs (см. appsscript/README.md) — данные появятся в течение 10 минут.
            </p>
          )}
        </div>
        <StaticRows rows={APPS_STATIC} consoleUrl={appsConsole} consoleLabel="Выполнения и триггеры в Apps Script" />
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">Кто тратит квоты Apps Script</p>
        {fnRows.length === 0 ? (
          <p className="text-[13px] text-muted">Пока нет данных.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase text-muted">
                  <th className="pb-1.5 font-bold">Что</th>
                  <th className="pb-1.5 text-right font-bold">Запусков</th>
                  <th className="pb-1.5 text-right font-bold">UrlFetch</th>
                  <th className="pb-1.5 text-right font-bold">Время</th>
                  <th className="pb-1.5 text-right font-bold">Чтений / записей</th>
                  <th className="pb-1.5 text-right font-bold">Ошибок</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {fnRows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-1.5 pr-3">
                      <span className="block font-bold text-text">{r.title}</span>
                      <span className="block text-[11px] text-muted">
                        {r.kind}
                        {r.hint ? ` · ${r.hint}` : ''}
                      </span>
                      <span className="mt-1 block max-w-[220px]">
                        <Bar pct={fetches > 0 ? ((r.fetches ?? 0) / fetches) * 100 : 0} height="h-1.5" />
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-text">{fmt(r.runs)}</td>
                    <td className="py-1.5 text-right text-text">{fmt(r.fetches)}</td>
                    <td className="py-1.5 text-right text-text">{formatDuration(r.ms)}</td>
                    <td className="py-1.5 text-right text-text">
                      {fmt(r.reads)} / {fmt(r.writes)}
                    </td>
                    <td className={`py-1.5 text-right ${r.errors > 0 ? 'font-bold text-danger' : 'text-text'}`}>{fmt(r.errors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">Полоса под названием — доля этой функции в запросах UrlFetch за сутки. «Время» триггеров идёт в лимит 90 минут, веб-запросы — нет.</p>
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">Что читает и пишет приложение (CRM)</p>
        <p className="mb-2 text-[12px] font-bold uppercase text-muted">Чтения по разделам</p>
        {sections.length === 0 ? (
          <p className="text-[13px] text-muted">Пока нет данных — счётчик заполнится, когда пользователи поработают в приложении.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sections.map((s) => (
              <div key={s.key}>
                <div className="mb-1 flex items-baseline justify-between text-[13px]">
                  <span className="text-text">{s.label}</span>
                  <span className="text-muted">
                    {fmt(s.n)} · {app?.reads > 0 ? Math.round((s.n / app.reads) * 100) : 0}%
                  </span>
                </div>
                <Bar pct={app?.reads > 0 ? (s.n / app.reads) * 100 : 0} />
              </div>
            ))}
          </div>
        )}
        {writeSections.length > 0 && (
          <>
            <p className="mb-2 mt-4 text-[12px] font-bold uppercase text-muted">Записи по разделам</p>
            <div className="flex flex-col gap-2.5">
              {writeSections.map((s) => (
                <div key={s.key}>
                  <div className="mb-1 flex items-baseline justify-between text-[13px]">
                    <span className="text-text">{s.label}</span>
                    <span className="text-muted">
                      {fmt(s.n)} · {app?.writes > 0 ? Math.round((s.n / app.writes) * 100) : 0}%
                    </span>
                  </div>
                  <Bar pct={app?.writes > 0 ? (s.n / app.writes) * 100 : 0} />
                </div>
              ))}
            </div>
          </>
        )}
        <p className="mb-2 mt-4 text-[12px] font-bold uppercase text-muted">Чтения по часам (сутки квоты идут с 12:00)</p>
        <div className="flex h-24 items-end gap-1">
          {byHour.map(({ h, n }) => (
            <div key={h} className="flex h-full flex-1 flex-col items-center justify-end" title={`${String(h).padStart(2, '0')}:00 — ${fmt(n)}`}>
              <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(n > 0 ? 3 : 1, (n / maxHour) * 100)}%`, background: n > 0 ? '#4364C3' : '#DADAD9' }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {byHour.map(({ h }) => (
            <span key={h} className="flex-1 text-center text-[9px] text-muted">
              {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">Последние дни</p>
        {history.length === 0 ? (
          <p className="text-[13px] text-muted">Истории пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase text-muted">
                  <th className="pb-1.5 font-bold">Сутки (с 12:00)</th>
                  <th className="pb-1.5 text-right font-bold">Чтений</th>
                  <th className="pb-1.5 text-right font-bold">Записей</th>
                  <th className="pb-1.5 text-right font-bold">UrlFetch</th>
                  <th className="pb-1.5 text-right font-bold">Триггеры</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map(([day, d]) => {
                  const p = ((d.reads ?? 0) / FIRESTORE_LIMITS.reads) * 100;
                  return (
                    <tr key={day}>
                      <td className="py-1.5 text-muted">{format(new Date(`${day}T12:00:00`), 'dd.MM.yyyy')}</td>
                      <td className="py-1.5 text-right" style={{ color: toneOf(p) }}>
                        {fmt(d.reads)}
                      </td>
                      <td className="py-1.5 text-right text-text">{fmt(d.writes)}</td>
                      <td className="py-1.5 text-right text-text">{d.fetches != null ? fmt(d.fetches) : '—'}</td>
                      <td className="py-1.5 text-right text-text">{d.triggerMs != null ? `${Math.round(d.triggerMs / 60000)} мин` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">Дата — начало суток квоты по Тихому океану. Данные накапливаются с момента включения учёта.</p>
      </Card>
    </div>
  );
}
