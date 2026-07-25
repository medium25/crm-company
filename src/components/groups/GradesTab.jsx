import { useMemo, useState } from 'react';
import { collection, addDoc, query, where } from 'firebase/firestore';
import { Star } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Input } from '../ui/Input.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

/**
 * Вкладка «Оценка» — простая оценка студента без привязки к конкретному
 * уроку (`lessonId` необязателен — полноценный выбор урока из сетки
 * посещаемости не строил, это сверх P1-объёма фазы 7).
 * @param {Object} props
 * @param {Object} props.group
 * @param {Array<Object>} props.enrollments
 */
export function GradesTab({ group, enrollments }) {
  const { showToast } = useToast();
  const [studentId, setStudentId] = useState('');
  const [value, setValue] = useState('');
  const [maxValue, setMaxValue] = useState('10');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const gradesQuery = useMemo(
    () => (db ? query(collection(db, 'grades'), where('groupId', '==', group.id)) : null),
    [group.id],
  );
  const { data: grades, loading } = useCollection(gradesQuery);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId || !value) return;
    setSaving(true);
    try {
      const enrollment = enrollments.find((en) => en.studentId === studentId);
      await addDoc(collection(db, 'grades'), {
        lessonId: null,
        groupId: group.id,
        studentId,
        studentName: enrollment?.studentName ?? '',
        value: Number(value),
        maxValue: Number(maxValue),
        comment,
      });
      setValue('');
      setComment('');
      showToast('Оценка сохранена.');
    } catch {
      showToast('Не удалось сохранить оценку.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Select
          options={[{ value: '', label: 'Студент' }, ...enrollments.map((en) => ({ value: en.studentId, label: en.studentName }))]}
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        />
        <Input type="number" placeholder="Балл" value={value} onChange={(e) => setValue(e.target.value)} />
        <Input type="number" placeholder="Из скольки" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />
        <Input placeholder="Комментарий" value={comment} onChange={(e) => setComment(e.target.value)} />
        <Button onClick={handleSubmit} loading={saving} disabled={!studentId || !value}>
          Добавить
        </Button>
      </form>

      {loading && <Skeleton className="h-20 w-full" />}

      {!loading && grades.length === 0 && <EmptyState icon={Star} title="Пока нет оценок" />}

      {!loading && grades.length > 0 && (
        <div className="flex flex-col gap-2">
          {grades.map((g) => (
            <div key={g.id} className="flex items-center justify-between rounded-row bg-surface-alt px-4 py-3 text-[15px]">
              <span className="text-text">{g.studentName}</span>
              <span className="font-bold text-navy-num">
                {g.value} / {g.maxValue}
              </span>
              <span className="text-[13px] text-muted">{g.comment}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
