import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatMoney, formatMoneySigned, formatMonth, formatMonthShort } from '../../lib/format.js';

const PERIOD_OPTIONS = [
  { value: 12, label: '12 мес' },
  { value: 'all', label: 'Всё время' },
];

/**
 * Сравнение последнего месяца с предыдущим — по последним двум точкам
 * `data` (в хронологическом порядке), независимо от выбранного периода
 * графика.
 * @param {Array<{month: string, amount: number}>} data
 * @returns {{diff: number, percent: number|null}|null}
 */
function useMonthComparison(data) {
  return useMemo(() => {
    if (!data || data.length < 2) return null;
    const last = data[data.length - 1];
    const prev = data[data.length - 2];
    const diff = last.amount - prev.amount;
    const percent = prev.amount === 0 ? null : (diff / Math.abs(prev.amount)) * 100;
    return { diff, percent };
  }, [data]);
}

function ChartTooltip({ active, payload }) {
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
 * Общий график выручки — используется и на дашборде, и в разделе «Все платежи».
 * Оранжевая линия, белые точки с оранжевой обводкой, ось Y в UZS.
 * @param {Object} props
 * @param {Array<{month: string, amount: number, paymentsCount: number}>} props.data
 *   отсортировано по возрастанию месяца, `monthlyRevenue` как есть
 */
export function RevenueChart({ data }) {
  const [period, setPeriod] = useState(12);
  const comparison = useMonthComparison(data);

  const filtered = useMemo(() => {
    if (period === 'all') return data;
    return data.slice(-period);
  }, [data, period]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        {comparison ? (
          <p className="text-[13px] text-muted">
            К прошлому месяцу:{' '}
            <span className={comparison.diff >= 0 ? 'font-bold text-success' : 'font-bold text-danger'}>
              {formatMoneySigned(comparison.diff)}
              {comparison.percent !== null && ` (${comparison.diff >= 0 ? '+' : ''}${comparison.percent.toFixed(1)}%)`}
            </span>
          </p>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
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
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filtered} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
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
            <Tooltip content={<ChartTooltip />} />
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
    </div>
  );
}
