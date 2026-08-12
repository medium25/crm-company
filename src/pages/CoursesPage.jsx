import { useMemo, useState } from 'react';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp, orderBy } from 'firebase/firestore';
import { Plus, Pencil, Archive, BookOpen } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';
import { formatMoney } from '../lib/format.js';
import { PALETTE } from '../lib/colors.js';

const EMPTY_FORM = { name: '', defaultPrice: '', defaultDurationMonths: '', color: PALETTE[0] };

const coursesQuery = query(collection(db, 'courses'), orderBy('name'));

export function CoursesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: allCourses, loading, error } = useCollection(db ? coursesQuery : null);

  const [showArchived, setShowArchived] = useState(false);
  const [modalCourse, setModalCourse] = useState(null); // null=закрыто, {}=создание, {...}=редактирование
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);

  const courses = useMemo(
    () => allCourses.filter((c) => Boolean(c.isArchived) === showArchived),
    [allCourses, showArchived],
  );

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setModalCourse({});
  };

  const openEdit = (course) => {
    setForm({
      name: course.name,
      defaultPrice: String(course.defaultPrice),
      defaultDurationMonths: String(course.defaultDurationMonths),
      color: course.color,
    });
    setModalCourse(course);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        defaultPrice: Number(form.defaultPrice),
        defaultDurationMonths: Number(form.defaultDurationMonths),
        color: form.color,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      };
      if (modalCourse?.id) {
        await updateDoc(doc(db, 'courses', modalCourse.id), payload);
        showToast('Курс обновлён.');
      } else {
        await addDoc(collection(db, 'courses'), {
          ...payload,
          isArchived: false,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
        showToast('Курс добавлен.');
      }
      setModalCourse(null);
    } catch {
      showToast('Не удалось сохранить курс.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const requestArchive = async (course) => {
    const usedByGroups = await getDocs(
      query(collection(db, 'groups'), where('courseId', '==', course.id), where('isArchived', '==', false)),
    );
    if (!usedByGroups.empty) {
      const codes = usedByGroups.docs.map((d) => d.data().code).join(', ');
      showToast(`Нельзя архивировать — используется в группах: ${codes}`, { type: 'error' });
      return;
    }
    setArchiveTarget(course);
  };

  const confirmArchive = async () => {
    setArchiving(true);
    try {
      await updateDoc(doc(db, 'courses', archiveTarget.id), {
        isArchived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast('Курс перенесён в архив.');
      setArchiveTarget(null);
    } catch {
      showToast('Не удалось архивировать курс.', { type: 'error' });
    } finally {
      setArchiving(false);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Название',
      render: (c) => (
        <span className="flex items-center gap-2 font-bold">
          <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
          {c.name}
        </span>
      ),
    },
    { key: 'defaultPrice', label: 'Цена по умолчанию', render: (c) => formatMoney(c.defaultPrice) },
    { key: 'defaultDurationMonths', label: 'Длительность', render: (c) => `${c.defaultDurationMonths} мес.` },
    {
      key: 'actions',
      label: '',
      render: (c) =>
        !showArchived && (
          <span className="flex justify-end gap-2">
            <Button variant="icon-round" tone="navy" onClick={() => openEdit(c)} aria-label="Редактировать">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="icon-round" tone="danger" onClick={() => requestArchive(c)} aria-label="Архивировать">
              <Archive className="h-4 w-4" />
            </Button>
          </span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Курсы"
        count={courses.length}
        actions={
          <>
            <Button variant="ghost" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Показать действующие' : 'Показать архивные'}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          </>
        }
      />

      {loading && (
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={4} />
          <SkeletonRow columns={4} />
        </div>
      )}

      {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

      {!loading && !error && courses.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title={showArchived ? 'Архив пуст' : 'Пока нет ни одного курса'}
          actionLabel={showArchived ? undefined : 'Добавить курс'}
          onAction={showArchived ? undefined : openCreate}
        />
      )}

      {!loading && !error && courses.length > 0 && <Table columns={columns} rows={courses} />}

      <Modal
        open={Boolean(modalCourse)}
        onClose={() => setModalCourse(null)}
        title={modalCourse?.id ? 'Редактировать курс' : 'Добавить курс'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalCourse(null)}>
              Отмена
            </Button>
            <Button onClick={handleSubmit} loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Название"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <Input
            label="Цена по умолчанию (сум/мес)"
            type="number"
            min="0"
            required
            value={form.defaultPrice}
            onChange={(e) => setForm((f) => ({ ...f, defaultPrice: e.target.value }))}
          />
          <Input
            label="Длительность (мес.)"
            type="number"
            min="1"
            required
            value={form.defaultDurationMonths}
            onChange={(e) => setForm((f) => ({ ...f, defaultDurationMonths: e.target.value }))}
          />
          <div>
            <span className="mb-1 block text-[13px] text-muted">Цвет</span>
            <div className="flex gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`h-8 w-8 rounded-full ${form.color === c ? 'ring-2 ring-navy ring-offset-2' : ''}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        loading={archiving}
        title="Архивировать курс"
        message={`Архивировать курс «${archiveTarget?.name}»? Он пропадёт из списков, история останется.`}
        confirmLabel="Архивировать"
      />
    </>
  );
}
