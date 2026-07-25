import { useMemo, useState } from 'react';
import { collection, addDoc, doc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { ClipboardList } from 'lucide-react';
import { db } from '../../firebase.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { formatDate } from '../../lib/format.js';

/**
 * Вкладка «Экзамены» — экзамен на группу + результаты по студентам.
 * @param {Object} props
 * @param {Object} props.group
 * @param {Array<Object>} props.enrollments
 */
export function ExamsTab({ group, enrollments }) {
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [saving, setSaving] = useState(false);

  const examsQuery = useMemo(() => (db ? query(collection(db, 'exams'), where('groupId', '==', group.id)) : null), [group.id]);
  const { data: exams, loading } = useCollection(examsQuery);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || !date) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'exams'), {
        groupId: group.id,
        name: name.trim(),
        date: Timestamp.fromDate(new Date(`${date}T00:00:00`)),
        maxScore: Number(maxScore),
        results: enrollments.map((en) => ({ studentId: en.studentId, studentName: en.studentName, score: null })),
      });
      setName('');
      setDate('');
      showToast('Экзамен создан.');
    } catch {
      showToast('Не удалось создать экзамен.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const setScore = async (exam, studentId, score) => {
    const results = exam.results.map((r) => (r.studentId === studentId ? { ...r, score: score === '' ? null : Number(score) } : r));
    try {
      await updateDoc(doc(db, 'exams', exam.id), { results });
    } catch {
      showToast('Не удалось сохранить результат.', { type: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Input placeholder="Название экзамена" value={name} onChange={(e) => setName(e.target.value)} />
        <DatePicker value={date} onChange={(e) => setDate(e.target.value)} />
        <Input type="number" placeholder="Максимум баллов" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} />
        <Button onClick={handleCreate} loading={saving} disabled={!name.trim() || !date}>
          Создать экзамен
        </Button>
      </form>

      {loading && <Skeleton className="h-20 w-full" />}

      {!loading && exams.length === 0 && <EmptyState icon={ClipboardList} title="Пока нет экзаменов" />}

      {!loading &&
        exams.map((exam) => (
          <div key={exam.id} className="rounded-card border border-border p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-bold text-text">{exam.name}</p>
              <p className="text-[13px] text-muted">
                {formatDate(exam.date)} · из {exam.maxScore}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {exam.results.map((r) => (
                <div key={r.studentId} className="flex items-center justify-between gap-3">
                  <span className="text-[15px] text-text">{r.studentName}</span>
                  <input
                    type="number"
                    min="0"
                    max={exam.maxScore}
                    defaultValue={r.score ?? ''}
                    onBlur={(e) => setScore(exam, r.studentId, e.target.value)}
                    className="h-9 w-20 rounded-field border border-border-strong px-2 text-center text-[15px] focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
