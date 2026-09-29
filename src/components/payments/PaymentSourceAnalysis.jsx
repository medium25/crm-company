import { useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { SectionTitle } from '../ui/SectionTitle.jsx';
import { Tile } from '../ui/Tile.jsx';
import { formatMoney, formatSource, pluralize } from '../../lib/format.js';

// «Таргет (р)» (ручной ввод) и «Таргет» (из таблицы) — один источник в анализе.
const MERGE_SOURCE = { target_manual: 'meta_target' };
const MERGED_LABEL = { meta_target: 'Таргет / Таргет (р)', prev_month: 'Прошлый месяц' };

/**
 * «Анализ источников оплат» — по каждому источнику лида (Таргет, Инстаграм …) две независимые
 * цифры «(N из M)»: N — оплат (разбивка плитки «добавились», сумма строк равна числу на плитке),
 * M — пробных этого источника в этом календарном месяце («пробные за месяц»); одно не обязано
 * быть частью другого, оба считаются по-разному.
 *
 * Отдельная строка «Прошлый месяц» — те из «добавились», чей пробный был НЕ в этом месяце (пришли
 * раньше, заплатили только сейчас): их настоящий источник тут не показан впрямую (чтобы не путать
 * с конверсией месяца), только по кнопке «i» — какие источники у них были на самом деле.
 * Студенты без источника — «Не указан». Данные считает countPaymentSources (stats.js) / Apps Script.
 * @param {Object} props
 * @param {Array<{key: string, count: number, amount: number, trialCount: number, breakdown?: Array<{key: string, count: number}>}>|null|undefined} props.sources undefined — ещё не посчитано
 * @param {string} [props.periodLabel] «за сентябрь»
 * @param {string} [props.className]
 */
export function PaymentSourceAnalysis({ sources, periodLabel = '', className = '' }) {
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const view = useMemo(() => {
    const merged = new Map();
    for (const r of sources ?? []) {
      const key = MERGE_SOURCE[r.key] ?? r.key;
      const cur = merged.get(key) ?? { key, count: 0, amount: 0, trialCount: 0, breakdown: null };
      cur.count += r.count;
      cur.amount += r.amount;
      cur.trialCount += r.trialCount ?? 0;
      if (r.breakdown) cur.breakdown = r.breakdown;
      merged.set(key, cur);
    }
    const list = [...merged.values()].sort((a, b) => b.count - a.count);
    const total = list.reduce((s, r) => s + r.count, 0);
    const maxCount = Math.max(1, ...list.map((r) => r.count));
    return {
      total,
      rows: list.map((r) => ({
        ...r,
        label: r.key === 'none' ? 'Не указан' : (MERGED_LABEL[r.key] ?? formatSource(r.key) ?? r.key),
        pct: total ? Math.round((r.count / total) * 100) : 0,
        width: Math.round((r.count / maxCount) * 100),
      })),
    };
  }, [sources]);

  return (
    <Card className={className}>
      <SectionTitle
        title="Анализ источников оплат"
        hint={`${periodLabel ? `· ${periodLabel} ` : '· '}${view.total} ${pluralize(view.total, ['оплата', 'оплаты', 'оплат'])}`}
      />
      {sources === undefined ? (
        <p className="text-small text-muted">Считаю…</p>
      ) : view.rows.length === 0 ? (
        <p className="text-small text-muted">Новых оплат за период пока нет.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {view.rows.map((r, i) => (
            <div key={r.key}>
              <div className="flex items-center gap-3 text-small">
                <span className="flex w-44 shrink-0 items-center gap-1 text-text">
                  {r.label}{' '}
                  <span className="text-muted">
                    {r.key === 'prev_month' ? `(${r.count})` : `(${r.count} из ${r.trialCount})`}
                  </span>
                  {r.key === 'prev_month' && r.breakdown?.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBreakdownOpen((v) => !v)}
                      aria-label="Из каких источников они были"
                      title="Из каких источников они были"
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-surface-alt ${breakdownOpen ? 'text-navy' : 'text-muted'}`}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
                <span className="h-4 flex-1 overflow-hidden rounded-badge bg-surface-alt">
                  <span className="block h-full rounded-badge" style={{ width: `${r.width}%`, backgroundColor: `rgb(var(--color-chart-${(i % 7) + 1}))` }} />
                </span>
                <span className="w-10 shrink-0 text-right text-muted">{r.pct}%</span>
                <span className="w-28 shrink-0 text-right font-bold text-text">{formatMoney(r.amount)}</span>
              </div>
              {r.key === 'prev_month' && breakdownOpen && r.breakdown?.length > 0 && (
                <Tile className="ml-1 mt-1.5 flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-caption text-muted">
                  {r.breakdown.map((b) => (
                    <span key={b.key}>
                      {b.key === 'none' ? 'Не указан' : (formatSource(b.key) ?? b.key)}: <span className="font-bold text-text">{b.count}</span>
                    </span>
                  ))}
                </Tile>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
