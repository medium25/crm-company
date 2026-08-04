import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';
import { Users } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { pluralize } from '../../lib/format.js';

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-field border border-border bg-surface p-3 text-[13px] shadow-hover">
      <p className="font-bold text-text">{point.teacherName}</p>
      <p className="text-text">
        {point.count} {pluralize(point.count, ['ученик', 'ученика', 'учеников'])}
      </p>
    </div>
  );
}

/**
 * Шапка раздела «Все ученики → Все ученики»: общее число студентов и
 * горизонтальные столбцы «сколько у каждого учителя» — сравнение величины,
 * поэтому один цвет (не категориальный), отсортировано по убыванию.
 * @param {Object} props
 * @param {number} props.total
 * @param {Array<{teacherId: string, teacherName: string, count: number}>} props.breakdown отсортировано по убыванию count
 */
export function AllStudentsSummary({ total, breakdown }) {
  const height = Math.max(120, breakdown.length * 44);

  return (
    <Card className="mb-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
          <Users className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[13px] text-muted">Всего учеников</p>
          <p className="text-[28px] font-bold leading-none text-navy-num">{total}</p>
        </div>
      </div>

      {breakdown.length > 0 && (
        <>
          <h3 className="mb-2 text-[13px] font-bold text-muted">По учителям</h3>
          <div style={{ height }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={breakdown} layout="vertical" margin={{ top: 4, right: 32, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="#E9EBEF" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#8B94A3' }} stroke="#E9EBEF" />
                <YAxis type="category" dataKey="teacherName" width={140} tick={{ fontSize: 13, fill: '#2B3440' }} stroke="#E9EBEF" />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#FAFBFC' }} />
                <Bar dataKey="count" fill="#E5842B" radius={[0, 4, 4, 0]} barSize={20}>
                  <LabelList dataKey="count" position="right" fill="#2B3440" fontSize={13} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}
