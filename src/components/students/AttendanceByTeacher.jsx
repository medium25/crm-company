import { useMemo, useState } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { ArrowLeft, GraduationCap, Layers } from 'lucide-react';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { AttendanceTab } from '../groups/AttendanceTab.jsx';
import { formatPhone, pluralize, formatAvgMonths } from '../../lib/format.js';

/**
 * «Посещаемость» в разделе «Студенты» — список учителей; по клику на
 * учителя показывается посещаемость всех его студентов сразу по всем его
 * группам (одна таблица-грид на группу, без захода в карточку группы).
 */
export function AttendanceByTeacher() {
  const { activeBranchId } = useBranch();
  const [teacherId, setTeacherId] = useState(null);

  const teachersQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'teachers'),
            where('branchIds', 'array-contains', activeBranchId),
            where('isArchived', '==', false),
            orderBy('displayName'),
          )
        : null,
    [activeBranchId],
  );
  const { data: teachers, loading: teachersLoading } = useCollection(teachersQuery);

  // Для «средний срок обучения» на карточке учителя — активные зачисления
  // (кто у кого учится) и активные студенты (когда пришёл), без захода в
  // конкретного учителя.
  const activeEnrollmentsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('status', '==', 'active'))
        : null,
    [activeBranchId],
  );
  const { data: activeEnrollments } = useCollection(activeEnrollmentsQuery);

  const activeStudentsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('status', '==', 'active'), where('isArchived', '==', false))
        : null,
    [activeBranchId],
  );
  const { data: activeStudents } = useCollection(activeStudentsQuery);

  const avgMonthsByTeacher = useMemo(() => {
    const studentById = new Map(activeStudents.map((st) => [st.id, st]));
    // Map<teacherId, Map<studentId, student>> — студент с 2 группами у
    // одного учителя не должен учитываться в среднем дважды.
    const byTeacher = new Map();
    for (const e of activeEnrollments) {
      const st = studentById.get(e.studentId);
      if (!st) continue;
      if (!byTeacher.has(e.teacherId)) byTeacher.set(e.teacherId, new Map());
      byTeacher.get(e.teacherId).set(st.id, st);
    }
    const result = new Map();
    for (const [tId, studentsMap] of byTeacher) result.set(tId, formatAvgMonths([...studentsMap.values()]));
    return result;
  }, [activeEnrollments, activeStudents]);

  const groupsQuery = useMemo(
    () =>
      db && activeBranchId && teacherId
        ? query(
            collection(db, 'groups'),
            where('branchId', '==', activeBranchId),
            where('teacherId', '==', teacherId),
            where('isArchived', '==', false),
            orderBy('code'),
          )
        : null,
    [activeBranchId, teacherId],
  );
  const { data: teacherGroups, loading: groupsLoading } = useCollection(groupsQuery);

  const teacher = teachers.find((t) => t.id === teacherId);

  if (!teacherId) {
    return (
      <>
        {teachersLoading && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] w-full rounded-card" />
            ))}
          </div>
        )}

        {!teachersLoading && teachers.length === 0 && (
          <EmptyState icon={GraduationCap} title="Пока нет ни одного учителя" />
        )}

        {!teachersLoading && teachers.length > 0 && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {teachers.map((t) => (
              <Card
                key={t.id}
                hoverable
                className="flex h-[88px] cursor-pointer items-center justify-between p-4"
                onClick={() => setTeacherId(t.id)}
              >
                <span className="font-bold text-text">{t.displayName}</span>
                <span className="text-[15px] text-link">{formatPhone(t.phone)}</span>
                <span className="text-[13px] text-muted">
                  Средний срок: <span className="font-bold text-text">{avgMonthsByTeacher.get(t.id) ?? '—'}</span>
                </span>
                <span className="text-[15px] text-muted">
                  {t.groupsCount} {pluralize(t.groupsCount, ['группа', 'группы', 'групп'])}
                </span>
              </Card>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setTeacherId(null)}
        className="mb-4 flex items-center gap-1 text-[15px] text-link"
      >
        <ArrowLeft className="h-4 w-4" /> Все учителя
      </button>

      <h2 className="mb-4 text-[20px] font-bold text-text">{teacher?.displayName}</h2>

      {groupsLoading && <Skeleton className="h-64 w-full" />}

      {!groupsLoading && teacherGroups.length === 0 && (
        <EmptyState icon={Layers} title="У этого учителя нет действующих групп" />
      )}

      {!groupsLoading && teacherGroups.length > 0 && (
        <div className="flex flex-col gap-8">
          {teacherGroups.map((group) => (
            <Card key={group.id}>
              <h3 className="mb-4 text-[15px] font-bold text-text">
                {group.code} · {group.courseName}
              </h3>
              <AttendanceTab group={group} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
