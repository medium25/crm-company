import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { ArrowLeft, Pencil, Layers } from 'lucide-react';
import { db } from '../firebase.js';
import { useDoc } from '../hooks/useDoc.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { TeacherFormModal } from '../components/teachers/TeacherFormModal.jsx';
import { formatPhone, pluralize } from '../lib/format.js';

export function TeacherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const teacherRef = useMemo(() => (db ? doc(db, 'teachers', id) : null), [id]);
  const { data: teacher, loading, error } = useDoc(teacherRef);
  const [editing, setEditing] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>;
  }

  if (!teacher) {
    return <EmptyState icon={Layers} title="Учитель не найден" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => navigate('/teachers')}
        className="mb-4 flex items-center gap-1 text-[15px] text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Все учителя
      </button>

      <PageHeader
        title={teacher.displayName}
        actions={
          <Button variant="icon-round" tone="navy" onClick={() => setEditing(true)} aria-label="Редактировать">
            <Pencil className="h-4 w-4" />
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="flex flex-col gap-3">
          <div>
            <span className="block text-[13px] text-muted">Полное имя</span>
            <span className="text-[15px] text-text">{teacher.fullName || '—'}</span>
          </div>
          <div>
            <span className="block text-[13px] text-muted">Телефон</span>
            <a href={`tel:+${teacher.phone}`} className="text-[15px] text-link">
              {formatPhone(teacher.phone)}
            </a>
          </div>
          <div>
            <span className="block text-[13px] text-muted">Филиалы</span>
            <span className="text-[15px] text-text">{teacher.branchIds?.join(', ') || '—'}</span>
          </div>
          <div>
            <span className="block text-[13px] text-muted">Групп</span>
            <span className="text-[15px] text-text">
              {teacher.groupsCount} {pluralize(teacher.groupsCount, ['группа', 'группы', 'групп'])}
            </span>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-[20px] font-bold text-text">Группы</h2>
          <EmptyState icon={Layers} title="Группы появятся в Фазе 2" />
        </Card>
      </div>

      <TeacherFormModal teacher={editing ? teacher : null} onClose={() => setEditing(false)} />
    </>
  );
}
