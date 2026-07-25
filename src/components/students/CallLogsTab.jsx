import { useMemo, useState } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Phone } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { CallLogModal } from './CallLogModal.jsx';
import { formatDateTime } from '../../lib/format.js';

const RESULT_LABELS = {
  reached: 'Дозвонились',
  no_answer: 'Не ответил',
  busy: 'Занято',
  wrong_number: 'Неверный номер',
};

/**
 * Вкладка «История звонков» в карточке студента.
 * @param {Object} props
 * @param {string} props.studentId
 */
export function CallLogsTab({ studentId }) {
  const [modalOpen, setModalOpen] = useState(false);

  const callsQuery = useMemo(
    () => (db ? query(collection(db, 'callLogs'), where('studentId', '==', studentId), orderBy('createdAt', 'desc')) : null),
    [studentId],
  );
  const { data: calls, loading } = useCollection(callsQuery);

  return (
    <div className="flex flex-col gap-4">
      <Button className="self-start" onClick={() => setModalOpen(true)}>
        <Phone className="h-4 w-4" /> Записать звонок
      </Button>

      {loading && <Skeleton className="h-20 w-full" />}

      {!loading && calls.length === 0 && <EmptyState icon={Phone} title="Пока нет звонков" />}

      {!loading && calls.length > 0 && (
        <div className="flex flex-col gap-2">
          {calls.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-row bg-surface-alt px-4 py-3 text-[15px]">
              <div>
                <span className="font-bold text-text">{c.direction === 'out' ? 'Исходящий' : 'Входящий'}</span>{' '}
                <span className="text-muted">— {RESULT_LABELS[c.result] ?? c.result}</span>
                {c.comment && <p className="text-[13px] text-muted">{c.comment}</p>}
              </div>
              <div className="text-right text-[13px] text-muted">
                <p>{c.userName}</p>
                <p>{formatDateTime(c.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <CallLogModal open={modalOpen} studentId={studentId} onClose={() => setModalOpen(false)} />
    </div>
  );
}
