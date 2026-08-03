import { useMemo, useState } from 'react';
import { collection, addDoc, doc, updateDoc, query, where, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ListTodo, Check } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { formatDate } from '../../lib/format.js';

/**
 * Список задач-напоминаний по студенту (например "перезвонить должнику") +
 * форма добавить новую. Напоминание — только визуальное: просроченная
 * невыполненная задача подсвечивается красным, никаких push/SMS.
 * @param {Object} props
 * @param {{id: string, fullName: string}|null} props.student
 * @param {() => void} props.onClose
 */
export function TaskListModal({ student, onClose }) {
  const { user, staff } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [saving, setSaving] = useState(false);

  const tasksQuery = useMemo(
    () =>
      db && student
        ? query(collection(db, 'tasks'), where('studentId', '==', student.id), orderBy('dueDate', 'desc'))
        : null,
    [student],
  );
  const { data: tasks, loading, error } = useCollection(tasksQuery);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || !student) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'tasks'), {
        studentId: student.id,
        studentName: student.fullName,
        branchId: activeBranchId,
        text: text.trim(),
        dueDate: Timestamp.fromDate(new Date(`${dueDate}T00:00:00`)),
        status: 'pending',
        createdBy: user.uid,
        createdByName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
        doneBy: null,
        doneAt: null,
      });
      setText('');
      setDueDate(format(new Date(), 'yyyy-MM-dd'));
    } catch {
      showToast('Не удалось сохранить задачу.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (task) => {
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        status: 'done',
        doneBy: user.uid,
        doneAt: serverTimestamp(),
      });
    } catch {
      showToast('Не удалось отметить задачу.', { type: 'error' });
    }
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  return (
    <Modal open={Boolean(student)} onClose={onClose} title={student ? `Задачи — ${student.fullName}` : ''} width="table">
      {student && (
        <div className="flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <Input label="Что сделать" className="flex-1" value={text} onChange={(e) => setText(e.target.value)} />
            <DatePicker label="Дата" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <Button onClick={handleSubmit} loading={saving} disabled={!text.trim()}>
              Добавить
            </Button>
          </form>

          {loading && <Skeleton className="h-20 w-full" />}

          {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

          {!loading && !error && tasks.length === 0 && <EmptyState icon={ListTodo} title="Пока нет задач" />}

          {!loading && !error && tasks.length > 0 && (
            <div className="flex flex-col gap-2">
              {tasks.map((t) => {
                const overdue = t.status === 'pending' && format(t.dueDate.toDate(), 'yyyy-MM-dd') < today;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center justify-between gap-3 rounded-row p-3 ${
                      t.status === 'done' ? 'bg-surface-alt' : overdue ? 'bg-danger-bg/10' : 'bg-surface-alt'
                    }`}
                  >
                    <div className="flex-1">
                      <p className={`text-[15px] ${t.status === 'done' ? 'text-muted line-through' : 'text-text'}`}>{t.text}</p>
                      <p className={`text-[13px] ${overdue ? 'font-bold text-danger' : 'text-muted'}`}>
                        {formatDate(t.dueDate)} · {t.createdByName}
                      </p>
                    </div>
                    {t.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => markDone(t)}
                        aria-label="Отметить выполненной"
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong text-muted hover:bg-surface hover:text-success"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
