import { useMemo } from 'react';
import { Card } from '../ui/Card.jsx';
import { SectionTitle } from '../ui/SectionTitle.jsx';
import { formatMoney, pluralize } from '../../lib/format.js';

// Зеркало PAYMENT_SOURCE_BUCKETS/paymentSourceBucket (stats.js) — countPaymentSources уже
// возвращает ровно эти 4 ключа, тут только подписи.
const BUCKET_LABEL = { returned: 'Вернулся', banner: 'Баннер на улице', target: 'Таргет', word_of_mouth: 'Рекомендации' };

/**
 * «Анализ источников оплат» — всегда 4 раздела (BUCKET_LABEL), по каждому две независимые цифры
 * «(N из M)»: N — оплат (разбивка плитки «добавились», сумма строк равна числу на плитке), M —
 * пробных этого раздела в этом календарном месяце («пробные за месяц»); одно не обязано быть
 * частью другого, оба считаются по-разному. Данные считает countPaymentSources (stats.js) / Apps Script.
 * @param {Object} props
 * @param {Array<{key: string, count: number, amount: number, trialCount: number}>|null|undefined} props.sources undefined — ещё не посчитано
 * @param {string} [props.periodLabel] «за сентябрь»
 * @param {string} [props.className]
 */
export function PaymentSourceAnalysis({ sources, periodLabel = '', className = '' }) {
  const view = useMemo(() => {
    const list = sources ?? [];
    const total = list.reduce((s, r) => s + r.count, 0);
    const maxCount = Math.max(1, ...list.map((r) => r.count));
    return {
      total,
      rows: list.map((r) => ({
        ...r,
        label: BUCKET_LABEL[r.key] ?? r.key,
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
            <div key={r.key} className="flex items-center gap-3 text-small">
              <span className="flex w-44 shrink-0 items-center gap-1 text-text">
                {r.label} <span className="text-muted">({r.count} из {r.trialCount})</span>
              </span>
              <span className="h-4 flex-1 overflow-hidden rounded-badge bg-surface-alt">
                <span className="block h-full rounded-badge" style={{ width: `${r.width}%`, backgroundColor: `rgb(var(--color-chart-${(i % 7) + 1}))` }} />
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
