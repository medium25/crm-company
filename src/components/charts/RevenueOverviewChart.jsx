import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney, formatMonth, formatMonthShort } from '../../lib/format.js';
import { MonthComparisonChart } from './MonthComparisonChart.jsx';

const PERIOD_OPTIONS = [
  { value: 'compare', label: 'Сравнение' },
  { value: 12, label: '12 мес' },
  { value: 'all', label: 'Всё время' },
];

function MonthlyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-field border border-border bg-surface p-3 text-[13px] shadow-hover">
      <p className="font-bold text-text">{formatMonth(point.month)}</p>
      <p className="text-text">{formatMoney(point.amount)}</p>
      <p className="text-muted">{point.paymentsCount ?? 0} платежей</p>
    </div>
  );
}

/**
 * Карточка графика выручки на дашборде — переключатель «Сравнение / 12 мес /
 * Всё время» над одним и тем же графиком. «Сравнение» — 2 линии, текущий
 * месяц против предыдущего, по дням нарастающим итогом. «12 мес»/«Всё
 * время» — обычная помесячная линия, как в RevenueChart (Платежи/Отчёты).
 * @param {Object} props
 * @param {{data: Array, currentMonth: string, prevMonth: string}} props.comparison
 * @param {Array<{month: string, amount: number, paymentsCount: number}>} props.monthly
 */
export function RevenueOverviewChart({ comparison, monthly }) {
  const [period, setPeriod] = useState('compare');

  const filteredMonthly = useMemo(() => {
    if (period === 'all') return monthly;
    if (period === 12) return monthly.slice(-12);
    return [];
  }, [monthly, period]);

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setPeriod(opt.value)}
            className={`rounded-full px-3 py-1 text-[13px] ${
              period === opt.value ? 'bg-navy text-white' : 'bg-surface-alt text-muted hover:text-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {period === 'compare' ? (
        <MonthComparisonChart data={comparison.data} currentMonth={comparison.currentMonth} prevMonth={comparison.prevMonth} />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={filteredMonthly} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
              <CartesianGrid stroke="#E9EBEF" />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => formatMonthShort(m)}
                angle={-45}
                textAnchor="end"
                interval={1}
                height={60}
                tick={{ fontSize: 12, fill: '#8B94A3' }}
                stroke="#E9EBEF"
              />
              <YAxis tickFormatter={(v) => formatMoney(v)} tick={{ fontSize: 12, fill: '#8B94A3' }} stroke="#E9EBEF" width={110} />
              <Tooltip content={<MonthlyTooltip />} />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="#E5842B"
                strokeWidth={2}
                dot={{ stroke: '#E5842B', strokeWidth: 2, fill: '#FFFFFF', r: 5 }}
                activeDot={{ stroke: '#E5842B', strokeWidth: 2, fill: '#FFFFFF', r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
