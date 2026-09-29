import { useMemo } from 'react';
import { Card } from '../ui/Card.jsx';
import { formatMoney, formatSource, pluralize } from '../../lib/format.js';

// «Таргет (р)» (ручной ввод) и «Таргет» (из таблицы) — один источник в анализе.
const MERGE_SOURCE = { target_manual: 'meta_target' };
const MERGED_LABEL = { meta_target: 'Таргет / Таргет (р)' };

const BAR_COLORS = ['#378ADD', '#1D9E75', '#BA7517', '#7F77DD', '#888780', '#D4537E', '#0F6E56'];

/**
 * «Анализ источников оплат» — сколько НОВЫХ оплат (первых оплат новых учеников) пришло с каждого
 * источника лида (Таргет, Инстаграм …): название «(N из M)» — N оплат из M пробных этого
 * источника в этом месяце, полоса по N, доля и сумма. Студенты без источника — «Не указан».
 * Данные считает countPaymentSources (stats.js) / Apps Script.
 * @param {Object} props
 * @param {Array<{key: string, count: number, amount: number, trialCount: number}>|null|undefined} props.sources undefined — ещё не посчитано
 * @param {string} [props.periodLabel] «за сентябрь»
 * @param {string} [props.className]
 */
export function PaymentSourceAnalysis({ sources, periodLabel = '', className = '' }) {
  const view = useMemo(() => {
    const merged = new Map();
    for (const r of sources ?? []) {
      const key = MERGE_SOURCE[r.key] ?? r.key;
      const cur = merged.get(key) ?? { key, count: 0, amount: 0, trialCount: 0 };
      cur.count += r.count;
      cur.amount += r.amount;
      cur.trialCount += r.trialCount ?? 0;
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
      <p className="mb-3 text-[15px] font-bold text-text">
        Анализ источников оплат{' '}
        <span className="text-[12px] font-normal text-muted">
          {periodLabel ? `· ${periodLabel} ` : '· '}
          {view.total} {pluralize(view.total, ['оплата', 'оплаты', 'оплат'])}
        </span>
      </p>
      {sources === undefined ? (
        <p className="text-[13px] text-muted">Считаю…</p>
      ) : view.rows.length === 0 ? (
        <p className="text-[13px] text-muted">Новых оплат за месяц пока нет.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {view.rows.map((r, i) => (
            <div key={r.key} className="flex items-center gap-3 text-[13px]">
              <span className="w-44 shrink-0 text-text">
                {r.label} <span className="text-muted">({r.count} из {r.trialCount})</span>
              </span>
              <span className="h-4 flex-1 overflow-hidden rounded bg-surface-alt">
                <span className="block h-full rounded" style={{ width: `${r.width}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
              </span>
              <span className="w-10 shrink-0 text-right text-muted">{r.pct}%</span>
              <span className="w-28 shrink-0 text-right font-bold text-text">{formatMoney(r.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
