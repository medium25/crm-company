import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { chartColors } from '../../lib/chartColors.js';
import { pluralize } from '../../lib/format.js';

function ChartTooltip({ active, payload, label, monthLabel }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  const n = payload[0].value;
  return (
    <div className="rounded-field border border-border bg-surface p-3 text-small shadow-hover">
      <p className="font-bold text-text">
        {label} {monthLabel}
      </p>
      <p className="text-text">
        {n} {pluralize(n, ['пробный', 'пробных', 'пробных'])}
      </p>
    </div>
  );
}

/**
 * Пробные по дням месяца — линия, как на графике выручки (RevenueChart): тёмная
 * линия, белые точки, сетка. Дни после сегодняшнего — без точек (пробных там ещё
 * не было).
 * @param {Object} props
 * @param {Array<{day: number, count: number|null}>} props.data
 * @param {string} props.monthLabel «сентября» — для подсказки
 */
export function TrialsMonthChart({ data, monthLabel = '' }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid stroke={chartColors.grid} />
          <XAxis dataKey="day" tick={{ fontSize: 12, fill: chartColors.axis }} stroke={chartColors.grid} interval={1} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: chartColors.axis }} stroke={chartColors.grid} width={36} />
          <Tooltip content={<ChartTooltip monthLabel={monthLabel} />} />
          <Line
            type="monotone"
            dataKey="count"
            stroke={chartColors.line}
            strokeWidth={2}
            connectNulls={false}
            dot={{ stroke: chartColors.line, strokeWidth: 2, fill: chartColors.white, r: 5 }}
            activeDot={{ stroke: chartColors.line, strokeWidth: 2, fill: chartColors.white, r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
