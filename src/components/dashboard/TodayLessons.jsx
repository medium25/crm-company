import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { CalendarCheck, CheckCircle2, Circle } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Card } from '../ui/Card.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';

/**
 * Ближайшие уроки сегодня — время, группа, учитель, кабинет, отметил ли
 * учитель посещаемость (`lesson.status === 'held'`).
 * @param {Object} props
 * @param {string} props.branchId
 */
export function TodayLessons({ branchId }) {
  const navigate = useNavigate();
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const lessonsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'lessons'), where('branchId', '==', branchId), where('dateKey', '==', todayKey)) : null),
    [branchId, todayKey],
  );
  const { data: lessons, loading } = useCollection(lessonsQuery);

  const groupsQuery = useMemo(
    () => (db && branchId ? query(collection(db, 'groups'), where('branchId', '==', branchId), where('isArchived', '==', false)) : null),
    [branchId],
  );
  const { data: groups } = useCollection(groupsQuery);
  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const sorted = useMemo(
    () =>
      [...lessons]
        .filter((l) => l.status !== 'cancelled')
        .sort((a, b) => (groupsById.get(a.groupId)?.schedule.time ?? '').localeCompare(groupsById.get(b.groupId)?.schedule.time ?? '')),
    [lessons, groupsById],
  );

  return (
    <Card>
      <h3 className="mb-4 text-[20px] font-bold text-text">Ближайшие уроки сегодня</h3>
      {!loading && sorted.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="Сегодня уроков нет" />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((lesson) => {
            const group = groupsById.get(lesson.groupId);
            const marked = lesson.status === 'held';
            return (
              <div
                key={lesson.id}
                onClick={() => navigate(`/groups/${lesson.groupId}`)}
                className="flex cursor-pointer items-center justify-between rounded-row bg-surface-alt px-4 py-3 hover:bg-border"
              >
                <div className="flex items-center gap-3">
                  <span className="w-14 font-bold text-text">{group?.schedule.time ?? '—'}</span>
                  <span className="text-[15px] text-text">{lesson.groupCode}</span>
                  <span className="text-[13px] text-muted">{group?.teacherName}</span>
                  <span className="text-[13px] text-muted">{group?.roomName}</span>
                </div>
                {marked ? (
                  <CheckCircle2 className="h-4 w-4 text-success" aria-label="Посещаемость отмечена" />
                ) : (
                  <Circle className="h-4 w-4 text-muted" aria-label="Посещаемость не отмечена" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
