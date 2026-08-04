import { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Users } from 'lucide-react';
import { Card } from '../ui/Card.jsx';
import { pluralize } from '../../lib/format.js';

// Категориальная палитра — фиксированный порядок слотов, проверен на
// соседнюю CVD-безопасность (worst adjacent ΔE 9.1, dataviz-skill palette.md).
// Слот закрепляется за учителем (см. colorByTeacher ниже), не за рангом —
// иначе перестановка мест при смене чисел перекрашивала бы survivors.
const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const RADIAN = Math.PI / 180;

// Подпись-выноска у каждого сектора вместо отдельной легенды: линия от края
// кольца к тексту «учитель / N · %», как в стандартном recharts-примере с
// customized label, адаптировано под донат (innerRadius > 0).
function renderCalloutLabel(colorByTeacher) {
  return ({ cx, cy, midAngle, outerRadius, percent, payload }) => {
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 8) * cos;
    const sy = cy + (outerRadius + 8) * sin;
    const mx = cx + (outerRadius + 26) * cos;
    const my = cy + (outerRadius + 26) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 14;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';
    const color = colorByTeacher.get(payload.teacherId);
    return (
      <g>
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={color} fill="none" />
        <circle cx={ex} cy={ey} r={2} fill={color} stroke="none" />
        <text x={ex + (cos >= 0 ? 6 : -6)} y={ey - 2} textAnchor={textAnchor} className="fill-text text-[13px] font-bold">
          {payload.teacherName}
        </text>
        <text x={ex + (cos >= 0 ? 6 : -6)} y={ey + 15} textAnchor={textAnchor} className="fill-muted text-[15px] font-bold">
          {payload.count} · {Math.round(percent * 100)}%
        </text>
      </g>
    );
  };
}

function ChartTooltip({ active, payload, total }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const percent = total > 0 ? Math.round((point.count / total) * 100) : 0;
  return (
    <div className="rounded-field border border-border bg-surface p-3 text-[13px] shadow-hover">
      <p className="font-bold text-text">{point.teacherName}</p>
      <p className="text-text">
        {point.count} {pluralize(point.count, ['ученик', 'ученика', 'учеников'])} ({percent}%)
      </p>
    </div>
  );
}

/**
 * Шапка раздела «Все ученики → Все ученики» — донат «сколько у какого
 * учителя» с общим числом в центре, плюс легенда (обязательна для ≥2
 * категорий). Замороженные студенты уже исключены вызывающей стороной —
 * total/breakdown сюда приходят посчитанными без них.
 * @param {Object} props
 * @param {number} props.total студентов без учёта замороженных
 * @param {Array<{teacherId: string, teacherName: string, count: number}>} props.breakdown отсортировано по убыванию count
 */
export function AllStudentsSummary({ total, breakdown }) {
  const colorByTeacher = useMemo(() => {
    const stableOrder = [...breakdown].sort((a, b) => a.teacherId.localeCompare(b.teacherId));
    const map = new Map();
    stableOrder.forEach((t, i) => map.set(t.teacherId, CATEGORICAL[i % CATEGORICAL.length]));
    return map;
  }, [breakdown]);

  return (
    <Card className="mb-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
          <Users className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[15px] font-bold text-text">Всего учеников</p>
          <p className="text-[13px] text-muted">без учёта замороженных</p>
        </div>
      </div>

      {breakdown.length === 0 ? (
        <p className="text-[15px] text-muted">
          {total > 0 ? `${total} ${pluralize(total, ['ученик', 'ученика', 'учеников'])}, пока без группы.` : 'Учеников пока нет.'}
        </p>
      ) : (
        <div className="relative mx-auto h-[360px] w-full max-w-[560px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="count"
                nameKey="teacherName"
                innerRadius="42%"
                outerRadius="62%"
                paddingAngle={2}
                stroke="#FFFFFF"
                strokeWidth={2}
                label={renderCalloutLabel(colorByTeacher)}
                labelLine={false}
              >
                {breakdown.map((t) => (
                  <Cell key={t.teacherId} fill={colorByTeacher.get(t.teacherId)} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip total={total} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[32px] font-bold leading-none text-navy-num">{total}</span>
            <span className="text-[13px] text-muted">{pluralize(total, ['ученик', 'ученика', 'учеников'])}</span>
          </div>
        </div>
      )}
    </Card>
  );
}
