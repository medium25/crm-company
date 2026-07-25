import { useMemo } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { History } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { formatDateTime, formatMoney } from '../../lib/format.js';

const FIELD_LABELS = {
  price: 'Цена',
  status: 'Статус',
  teacherId: 'Учитель',
  studentsCount: 'Состав группы',
};

const ACTION_LABELS = {
  update: 'изменил(а)',
  enrollment_added: 'добавил(а) в группу',
  enrollment_paused: 'заморозил(а) запись',
  enrollment_left: 'вывел(а) из группы',
};

function renderValue(field, value) {
  if (value === null || value === undefined) return '—';
  if (field === 'price' && typeof value === 'number') return formatMoney(value);
  return String(value);
}

/**
 * Вкладка «История» — общая для студента и группы, читает `activityLog`.
 * @param {Object} props
 * @param {string} props.entityType
 * @param {string} props.entityId
 */
export function HistoryTab({ entityType, entityId }) {
  const logQuery = useMemo(
    () =>
      db
        ? query(collection(db, 'activityLog'), where('entityType', '==', entityType), where('entityId', '==', entityId), orderBy('createdAt', 'desc'))
        : null,
    [entityType, entityId],
  );
  const { data: entries, loading } = useCollection(logQuery);

  if (loading) return <Skeleton className="h-20 w-full" />;
  if (entries.length === 0) return <EmptyState icon={History} title="Пока нет истории изменений" />;

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center justify-between rounded-row bg-surface-alt px-4 py-3 text-[15px]">
          <span className="text-text">
            <span className="font-bold">{e.userName}</span> {ACTION_LABELS[e.action] ?? e.action}
            {e.field && (
              <>
                {' '}
                «{FIELD_LABELS[e.field] ?? e.field}»: {renderValue(e.field, e.before)} → {renderValue(e.field, e.after)}
              </>
            )}
          </span>
          <span className="text-[13px] text-muted">{formatDateTime(e.createdAt)}</span>
        </div>
      ))}
    </div>
  );
}
