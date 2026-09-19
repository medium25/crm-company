import { useEffect, useMemo, useReducer } from 'react';
import { collection, doc, query, where, orderBy, limit, documentId } from 'firebase/firestore';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { db, firebaseConfig } from '../../firebase.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { FREE_DAILY_READS, SECTION_LABELS, flushUsage, quotaDayKey, msUntilQuotaReset, usageDocId } from '../../lib/usageMeter.js';

const nf = new Intl.NumberFormat('ru-RU');
const fmt = (n) => nf.format(Math.round(n ?? 0));

const LIMITS = [
  { label: 'Чтения документов', value: '50 000 в сутки', note: 'считает эта страница' },
  { label: 'Записи документов', value: '20 000 в сутки', note: 'смотри в консоли Firebase' },
  { label: 'Удаления документов', value: '20 000 в сутки', note: 'смотри в консоли Firebase' },
  { label: 'Хранилище данных', value: '1 ГиБ', note: 'смотри в консоли Firebase' },
  { label: 'Исходящий трафик', value: '10 ГиБ в месяц', note: 'смотри в консоли Firebase' },
];

/** Цвет шкалы по доле лимита: до 60% — синий, до 90% — оранжевый, дальше — красный. */
const toneOf = (pct) => (pct >= 90 ? '#E11D48' : pct >= 60 ? '#E5842B' : '#4364C3');

function Bar({ pct, color = '#4364C3', height = 'h-2' }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-border ${height}`}>
      <div className={`${height} rounded-full`} style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

/** Через сколько сброс квоты — «3 ч 12 мин». */
function formatCountdown(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(totalMin / 60)} ч ${String(totalMin % 60).padStart(2, '0')} мин`;
}

/**
 * Настройки → Расход Firebase. Показывает, сколько документов приложение
 * прочитало из Firestore за текущие сутки квоты (лимит бесплатного тарифа —
 * 50 000 чтений в сутки), по часам и по разделам, и за последние дни. Считает
 * только это приложение (см. usageMeter.js) — точные итоги в консоли Firebase.
 */
export function FirebaseUsageTab() {
  const [, tick] = useReducer((n) => n + 1, 0);
  const dayKey = quotaDayKey();

  // Своё накопленное — сразу в базу, иначе последние минуты работы не видны; дальше перерисовка раз в минуту (таймер сброса).
  useEffect(() => {
    flushUsage();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const todayRef = useMemo(() => (db ? doc(db, 'settings', usageDocId(dayKey)) : null), [dayKey]);
  const { data: today, loading } = useDoc(todayRef);

  const recentQuery = useMemo(
    () => (db ? query(collection(db, 'settings'), where(documentId(), '>=', 'usage_'), where(documentId(), '<', 'usage_\uf8ff'), orderBy(documentId(), 'desc'), limit(8)) : null),
    [],
  );
  const { data: recent } = useCollection(recentQuery);

  const reads = today?.reads ?? 0;
  const pct = (reads / FREE_DAILY_READS) * 100;
  const resetMs = msUntilQuotaReset();
  const resetAt = format(new Date(Date.now() + resetMs), 'HH:mm');

  // Часы в порядке суток квоты: с 12:00 по местному времени до 11:00 следующего дня.
  const hours = Array.from({ length: 24 }, (_, i) => (12 + i) % 24);
  const byHour = hours.map((h) => ({ h, n: today?.byHour?.[String(h)] ?? 0 }));
  const maxHour = Math.max(1, ...byHour.map((x) => x.n));

  const sections = Object.entries(today?.byLabel ?? {})
    .map(([key, n]) => ({ key, n, label: SECTION_LABELS[key] ?? key }))
    .sort((a, b) => b.n - a.n);

  const consoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/-default-/usage`;

  if (loading) return <Skeleton className="h-64 w-full rounded-card" />;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">Чтения Firestore за сутки квоты</p>
            <p className="text-[32px] font-bold leading-tight text-text">
              {fmt(reads)} <span className="text-[18px] font-normal text-muted">из {fmt(FREE_DAILY_READS)}</span>
            </p>
          </div>
          <div className="text-right text-[13px] text-muted">
            <p>Сброс квоты в {resetAt} (Ташкент)</p>
            <p>через {formatCountdown(resetMs)}</p>
          </div>
        </div>
        <div className="mt-3">
          <Bar pct={pct} color={toneOf(pct)} height="h-3" />
          <p className="mt-1.5 text-[13px]" style={{ color: toneOf(pct) }}>
            {pct >= 100 ? 'Лимит превышен — часть запросов может отклоняться.' : pct >= 90 ? 'Почти весь лимит израсходован.' : pct >= 60 ? 'Больше половины лимита.' : 'В пределах лимита.'} Использовано {pct.toFixed(1)}%.
          </p>
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Считаются только чтения самого приложения (без скриптов, консоли Firebase и проверок правил), поэтому в консоли итог обычно выше, а данные,
          пришедшие из кэша браузера, не считаются вообще. Счётчик обновляется раз в 5 минут.
        </p>
        <a
          href={consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-1.5 text-[13px] font-bold text-white hover:bg-navy-hover"
        >
          Точные цифры в консоли Firebase <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">По часам (чтений в час)</p>
        <div className="flex h-32 items-end gap-1">
          {byHour.map(({ h, n }) => (
            <div key={h} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${String(h).padStart(2, '0')}:00 — ${fmt(n)}`}>
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
        <p className="mb-3 text-[15px] font-bold text-text">Что читает больше всего</p>
        {sections.length === 0 ? (
          <p className="text-[13px] text-muted">Пока нет данных — счётчик заполнится, когда пользователи поработают в приложении.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {sections.map((s) => (
              <div key={s.key}>
                <div className="mb-1 flex items-baseline justify-between text-[13px]">
                  <span className="text-text">{s.label}</span>
                  <span className="text-muted">
                    {fmt(s.n)} · {reads > 0 ? Math.round((s.n / reads) * 100) : 0}%
                  </span>
                </div>
                <Bar pct={reads > 0 ? (s.n / reads) * 100 : 0} />
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Чтения относятся к разделу, в котором пользователь был в момент загрузки данных. Самые большие разделы — первые кандидаты на оптимизацию.
        </p>
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">Последние дни</p>
        {recent.length === 0 ? (
          <p className="text-[13px] text-muted">Истории пока нет.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((d) => {
              const p = ((d.reads ?? 0) / FREE_DAILY_READS) * 100;
              return (
                <div key={d.id} className="flex items-center gap-3 text-[13px]">
                  <span className="w-24 shrink-0 text-muted">{format(new Date(`${d.id.replace('usage_', '')}T12:00:00`), 'dd.MM.yyyy')}</span>
                  <div className="flex-1">
                    <Bar pct={p} color={toneOf(p)} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-text">{fmt(d.reads)}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[12px] text-muted">Сутки квоты идут с 12:00 по Ташкенту, подпись — дата начала суток по тихоокеанскому времени.</p>
      </Card>

      <Card>
        <p className="mb-3 text-[15px] font-bold text-text">Бесплатные лимиты Firebase (тариф Spark)</p>
        <div className="flex flex-col divide-y divide-border">
          {LIMITS.map((l) => (
            <div key={l.label} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="text-text">{l.label}</span>
              <span className="text-right text-muted">
                {l.value} · {l.note}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
