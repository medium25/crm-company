import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatMoney, formatMonth } from '../../lib/format.js';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-field border border-border bg-surface p-3 text-[13px] shadow-hover">
      <p className="mb-1 font-bold text-text">{label} число</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value == null ? '—' : formatMoney(p.value)}
        </p>
      ))}
    </div>
  );
}

/**
 * Выручка текущего месяца против предыдущего, нарастающим итогом по дням —
 * 2 линии на одной оси X (день месяца), а не 2 точки на месячном графике.
 * Линия текущего месяца обрывается на сегодняшнем дне.
 * @param {Object} props
 * @param {Array<{day: number, current: number|null, previous: number|null}>} props.data
 * @param {string} props.currentMonth "yyyy-MM"
 * @param {string} props.prevMonth "yyyy-MM"
 */
export function MonthComparisonChart({ data, currentMonth, prevMonth }) {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid stroke="#E9EBEF" />
          <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#8B94A3' }} stroke="#E9EBEF" />
          <YAxis tickFormatter={(v) => formatMoney(v)} tick={{ fontSize: 12, fill: '#8B94A3' }} stroke="#E9EBEF" width={110} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <Line
            type="monotone"
            dataKey="current"
            name={formatMonth(currentMonth)}
            stroke="#E5842B"
            strokeWidth={2}
            dot={{ stroke: '#E5842B', strokeWidth: 2, fill: '#FFFFFF', r: 4 }}
            activeDot={{ stroke: '#E5842B', strokeWidth: 2, fill: '#FFFFFF', r: 5 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="previous"
            name={formatMonth(prevMonth)}
            stroke="#8B94A3"
            strokeWidth={2}
            dot={{ stroke: '#8B94A3', strokeWidth: 2, fill: '#FFFFFF', r: 4 }}
            activeDot={{ stroke: '#8B94A3', strokeWidth: 2, fill: '#FFFFFF', r: 5 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
