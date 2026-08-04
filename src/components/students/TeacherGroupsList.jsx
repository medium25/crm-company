import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Layers, ChevronRight } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { pluralize, formatWeekdays } from '../../lib/format.js';

const SECTIONS = [
  { type: 'even', label: 'Чётные дни' },
  { type: 'odd', label: 'Нечётные дни' },
  { type: 'weekdays', label: 'По дням недели' },
];

// Дни недели видны только у type === 'weekdays' — у чётных/нечётных сам
// заголовок секции уже говорит, по каким дням, конкретные даты плавают.
function scheduleSubtitle(schedule) {
  return schedule.type === 'weekdays' ? `${formatWeekdays(schedule.weekdays)} · ${schedule.time}` : schedule.time;
}

/**
 * Группы одного учителя со счётом студентов в каждой — лист drill-down
 * «Все ученики → учитель» на StudentsPage. Разбито на секции по типу
 * расписания (чётные/нечётные/по дням недели) с отступом между ними —
 * иначе группы разной чётности мешаются в одну кучу. Клик по группе ведёт
 * в её карточку (studentsCount там же денормализован и поддерживается в
 * актуальном состоянии всеми операциями добавления/вывода студента).
 * @param {Object} props
 * @param {string} props.teacherId
 * @param {string} props.branchId
 */
export function TeacherGroupsList({ teacherId, branchId }) {
  const navigate = useNavigate();
  const groupsQuery = useMemo(
    () =>
      db && branchId && teacherId
        ? query(
            collection(db, 'groups'),
            where('branchId', '==', branchId),
            where('teacherId', '==', teacherId),
            where('isArchived', '==', false),
            orderBy('code'),
          )
        : null,
    [branchId, teacherId],
  );
  const { data: groups, loading } = useCollection(groupsQuery);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (groups.length === 0) return <EmptyState icon={Layers} title="У этого учителя нет действующих групп" />;

  const sections = SECTIONS.map((s) => ({ ...s, groups: groups.filter((g) => g.schedule.type === s.type) })).filter(
    (s) => s.groups.length > 0,
  );

  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => (
        <div key={s.type}>
          <h3 className="mb-3 text-[15px] font-bold text-text">{s.label}</h3>
          <div className="flex flex-col gap-3">
            {s.groups.map((g) => (
              <Card key={g.id} hoverable className="flex cursor-pointer items-center justify-between p-4" onClick={() => navigate(`/groups/${g.id}`)}>
                <span>
                  <span className="font-bold text-text">{g.code}</span>
                  <span className="ml-2 text-[15px] text-muted">{g.courseName}</span>
                  <span className="ml-2 text-[13px] text-muted">{scheduleSubtitle(g.schedule)}</span>
                </span>
                <span className="flex items-center gap-2 text-[15px] text-muted">
                  {g.studentsCount} {pluralize(g.studentsCount, ['ученик', 'ученика', 'учеников'])}
                  <ChevronRight className="h-4 w-4 text-muted" />
                </span>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
