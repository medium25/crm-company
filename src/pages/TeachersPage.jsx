import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, doc, updateDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { Plus, UploadCloud, CheckCircle2, X, GraduationCap } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { TeacherFormModal } from '../components/teachers/TeacherFormModal.jsx';
import { ImportTeachersModal } from '../components/teachers/ImportTeachersModal.jsx';
import { formatPhone, pluralize } from '../lib/format.js';

const BANNER_KEY = 'icon-crm:teachers-banner-dismissed';

export function TeachersPage() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const teachersQuery = useMemo(() => {
    if (!db || !activeBranchId) return null;
    return query(
      collection(db, 'teachers'),
      where('branchIds', 'array-contains', activeBranchId),
      where('isArchived', '==', false),
      orderBy('displayName'),
    );
  }, [activeBranchId]);
  const { data: teachers, loading, error } = useCollection(teachersQuery);

  const [bannerDismissed, setBannerDismissed] = useState(() => localStorage.getItem(BANNER_KEY) === '1');
  const [modalTeacher, setModalTeacher] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const dismissBanner = () => {
    localStorage.setItem(BANNER_KEY, '1');
    setBannerDismissed(true);
  };

  const requestArchive = async (teacher) => {
    const usedByGroups = await getDocs(
      query(collection(db, 'groups'), where('teacherId', '==', teacher.id), where('isArchived', '==', false)),
    );
    if (!usedByGroups.empty) {
      const codes = usedByGroups.docs.map((d) => d.data().code).join(', ');
      showToast(`Нельзя архивировать — ведёт группы: ${codes}`, { type: 'error' });
      return;
    }
    setArchiveTarget(teacher);
  };

  const confirmArchive = async () => {
    setArchiving(true);
    try {
      await updateDoc(doc(db, 'teachers', archiveTarget.id), {
        isArchived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast('Учитель перенесён в архив.');
      setArchiveTarget(null);
    } catch {
      showToast('Не удалось архивировать учителя.', { type: 'error' });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Учителя"
        count={teachers.length}
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <UploadCloud className="h-4 w-4" /> Import
            </Button>
            <Button onClick={() => setModalTeacher({})}>
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          </>
        }
      />

      {!bannerDismissed && (
        <div className="mb-6 flex items-start gap-3 rounded-card bg-success-bg p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div className="flex-1">
            <p className="font-bold text-success">Внимание!</p>
            <p className="text-[15px] text-success">
              CEO профилями можно связать учителя с другим филиалом.
            </p>
          </div>
          <button type="button" onClick={dismissBanner} className="text-success" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-card" />
          ))}
        </div>
      )}

      {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

      {!loading && !error && teachers.length === 0 && (
        <EmptyState icon={GraduationCap} title="Пока нет ни одного учителя" actionLabel="Добавить учителя" onAction={() => setModalTeacher({})} />
      )}

      {!loading && !error && teachers.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {teachers.map((t) => (
            <Card
              key={t.id}
              hoverable
              className="flex h-[88px] cursor-pointer items-center justify-between p-4"
              onClick={() => navigate(`/teachers/${t.id}`)}
            >
              <span className="font-bold text-text">{t.displayName}</span>
              <a
                href={`tel:+${t.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[15px] text-link"
              >
                {formatPhone(t.phone)}
              </a>
              <span className="text-[15px] text-muted">
                {t.groupsCount} {pluralize(t.groupsCount, ['группа', 'группы', 'групп'])}
              </span>
              <DropdownMenu
                items={[
                  { label: 'Открыть', onClick: () => navigate(`/teachers/${t.id}`) },
                  { label: 'Редактировать', onClick: () => setModalTeacher(t) },
                  { label: 'Расписание', onClick: () => showToast('Появится в фазе 2.') },
                  { label: 'Архивировать', onClick: () => requestArchive(t), danger: true },
                ]}
              />
            </Card>
          ))}
        </div>
      )}

      <TeacherFormModal teacher={modalTeacher} onClose={() => setModalTeacher(null)} />

      <ImportTeachersModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        teachers={teachers}
        branchId={activeBranchId}
        userId={user.uid}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        loading={archiving}
        title="Архивировать учителя"
        message={`Архивировать учителя «${archiveTarget?.displayName}»? Он пропадёт из списков, история останется.`}
        confirmLabel="Архивировать"
      />
    </>
  );
}
