import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { FilterChip } from '../ui/FilterChip.jsx';
import { chartColors } from '../../lib/chartColors.js';
import { formatMoney, formatMonth, formatMonthShort } from '../../lib/format.js';

const PERIOD_OPTIONS = [
  { value: 12, label: '12 мес' },
  { value: 'all', label: 'Всё время' },
];

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-field border border-border bg-surface p-3 text-small shadow-hover">
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

  const filtered = useMemo(() => {
    if (period === 'all') return data;
    return data.slice(-period);
  }, [data, period]);

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <FilterChip key={opt.value} active={period === opt.value} onClick={() => setPeriod(opt.value)}>
            {opt.label}
          </FilterChip>
        ))}
      </div>

      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filtered} margin={{ top: 10, right: 20, bottom: 40, left: 10 }}>
            <CartesianGrid stroke={chartColors.grid} />
            <XAxis
              dataKey="month"
              tickFormatter={(m) => formatMonthShort(m)}
              angle={-45}
              textAnchor="end"
              interval={1}
              height={60}
              tick={{ fontSize: 12, fill: chartColors.axis }}
              stroke={chartColors.grid}
            />
            <YAxis tickFormatter={(v) => formatMoney(v)} tick={{ fontSize: 12, fill: chartColors.axis }} stroke={chartColors.grid} width={110} />
            <Tooltip content={<ChartTooltip />} />
            <Line
              type="monotone"
              dataKey="amount"
              stroke={chartColors.line}
              strokeWidth={2}
              dot={{ stroke: chartColors.line, strokeWidth: 2, fill: chartColors.white, r: 5 }}
              activeDot={{ stroke: chartColors.line, strokeWidth: 2, fill: chartColors.white, r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
