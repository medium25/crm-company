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
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative h-56 w-56 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={breakdown} dataKey="count" nameKey="teacherName" innerRadius="62%" outerRadius="92%" paddingAngle={2} stroke="#FFFFFF" strokeWidth={2}>
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

          <ul className="flex w-full flex-1 flex-col gap-2">
            {breakdown.map((t) => {
              const percent = total > 0 ? Math.round((t.count / total) * 100) : 0;
              return (
                <li key={t.teacherId} className="flex items-center gap-2 text-[15px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorByTeacher.get(t.teacherId) }} />
                  <span className="flex-1 truncate text-text">{t.teacherName}</span>
                  <span className="text-muted">
                    {t.count} · {percent}%
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}
