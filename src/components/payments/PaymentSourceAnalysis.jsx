import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { pluralize } from '../../lib/format.js';

function StatCard({ title, value, caption, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative rounded-card border-[1.5px] border-border-strong bg-card p-4 text-left transition hover:border-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
    >
      <span className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-navy text-white transition group-hover:bg-navy-hover">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="block pr-9 text-page font-bold text-text">{title}</span>
      <span className="mt-4 block text-kpi font-bold tracking-tight text-text">{value ?? '…'}</span>
      <span className="mt-1 block text-small text-muted">{caption}</span>
    </button>
  );
}

/**
 * Две карточки «Анализ пробных» и «Анализ источников оплат» — по одному главному числу.
 * Числа — суммы по 4 разделам из countPaymentSources (stats.js) / Apps Script: пробные этого
 * календарного месяца (trialCount) и оплаты за период плитки «добавились» (count).
 * @param {Object} props
 * @param {Array<{key: string, count: number, amount: number, trialCount: number}>|null|undefined} props.sources undefined — ещё не посчитано
 * @param {string} [props.periodLabel] подпись периода оплат, «за сентябрь»
 * @param {() => void} [props.onOpenTrials]
 * @param {() => void} [props.onOpenPayments]
 * @param {string} [props.className]
 */
export function PaymentSourceAnalysis({ sources, periodLabel = '', onOpenTrials, onOpenPayments, className = '' }) {
  const totals = useMemo(() => {
    if (sources === undefined) return null;
    const list = sources ?? [];
    return { trials: list.reduce((s, r) => s + r.trialCount, 0), payments: list.reduce((s, r) => s + r.count, 0) };
  }, [sources]);

  return (
    <Card className={className}>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <StatCard
          title="Анализ пробных"
          value={totals?.trials}
          caption={totals ? pluralize(totals.trials, ['пробный', 'пробных', 'пробных']) + ' за месяц' : 'Считаю…'}
          onClick={onOpenTrials}
        />
        <StatCard
          title="Анализ источников оплат"
          value={totals?.payments}
          caption={totals ? `${pluralize(totals.payments, ['оплата', 'оплаты', 'оплат'])}${periodLabel ? ` · ${periodLabel}` : ''}` : 'Считаю…'}
          onClick={onOpenPayments}
        />
      </div>
    </Card>
  );
}
