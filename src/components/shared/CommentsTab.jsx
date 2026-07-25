import { useMemo, useState } from 'react';
import { collection, addDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { MessageSquare } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { formatDateTime } from '../../lib/format.js';

/**
 * Вкладка «Комментарии» — общая для студента и группы (`comments`, раздел 02).
 * @param {Object} props
 * @param {'student'|'group'|'lead'} props.entityType
 * @param {string} props.entityId
 */
export function CommentsTab({ entityType, entityId }) {
  const { user, staff } = useAuth();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const commentsQuery = useMemo(
    () =>
      db
        ? query(collection(db, 'comments'), where('entityType', '==', entityType), where('entityId', '==', entityId), orderBy('createdAt', 'desc'))
        : null,
    [entityType, entityId],
  );
  const { data: comments, loading } = useCollection(commentsQuery);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'comments'), {
        entityType,
        entityId,
        text: text.trim(),
        authorId: user.uid,
        authorName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      setText('');
    } catch {
      showToast('Не удалось сохранить комментарий.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          className="min-h-16 flex-1 rounded-field border border-border-strong p-2 text-[15px] focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
          placeholder="Написать комментарий…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button onClick={handleSubmit} loading={saving} disabled={!text.trim()}>
          Отправить
        </Button>
      </form>

      {loading && <Skeleton className="h-20 w-full" />}

      {!loading && comments.length === 0 && <EmptyState icon={MessageSquare} title="Пока нет комментариев" />}

      {!loading && comments.length > 0 && (
        <div className="flex flex-col gap-3">
          {comments.map((c) => (
            <div key={c.id} className="rounded-row bg-surface-alt p-3">
              <div className="mb-1 flex items-center justify-between text-[13px] text-muted">
                <span className="font-bold text-text">{c.authorName}</span>
                <span>{formatDateTime(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-[15px] text-text">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
