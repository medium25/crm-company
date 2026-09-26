import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { pluralize } from '../../lib/format.js';

function ChartTooltip({ active, payload, label, monthLabel }) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  const n = payload[0].value;
  return (
    <div className="rounded-field border border-border bg-surface p-3 text-[13px] shadow-hover">
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
          <CartesianGrid stroke="#E9EBEF" />
          <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#8B94A3' }} stroke="#E9EBEF" interval={1} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#8B94A3' }} stroke="#E9EBEF" width={36} />
          <Tooltip content={<ChartTooltip monthLabel={monthLabel} />} />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#3C4656"
            strokeWidth={2}
            connectNulls={false}
            dot={{ stroke: '#3C4656', strokeWidth: 2, fill: '#FFFFFF', r: 5 }}
            activeDot={{ stroke: '#3C4656', strokeWidth: 2, fill: '#FFFFFF', r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
