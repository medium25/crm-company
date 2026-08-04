import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Layers, ChevronRight } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { pluralize } from '../../lib/format.js';

/**
 * Группы одного учителя со счётом студентов в каждой — лист drill-down
 * «Все ученики → учитель» на StudentsPage. Клик по группе ведёт в её
 * карточку (studentsCount там же денормализован и поддерживается в актуальном
 * состоянии всеми операциями добавления/вывода студента).
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

  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <Card key={g.id} hoverable className="flex cursor-pointer items-center justify-between p-4" onClick={() => navigate(`/groups/${g.id}`)}>
          <span>
            <span className="font-bold text-text">{g.code}</span>
            <span className="ml-2 text-[15px] text-muted">{g.courseName}</span>
          </span>
          <span className="flex items-center gap-2 text-[15px] text-muted">
            {g.studentsCount} {pluralize(g.studentsCount, ['ученик', 'ученика', 'учеников'])}
            <ChevronRight className="h-4 w-4 text-muted" />
          </span>
        </Card>
      ))}
    </div>
  );
}
