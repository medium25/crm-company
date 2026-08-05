import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, orderBy, doc, updateDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { Plus, UploadCloud, CheckCircle2, X, GraduationCap, ArrowLeft } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useRole } from '../hooks/useRole.js';
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
import { GroupFormModal } from '../components/groups/GroupFormModal.jsx';
import { TeacherGroupsList } from '../components/students/TeacherGroupsList.jsx';
import { formatPhone, pluralize } from '../lib/format.js';

const BANNER_KEY = 'icon-crm:teachers-banner-dismissed';

/**
 * «Учителя и группы» — объединённый раздел (были два отдельных пункта в
 * сайдбаре). Уровень 1 — список учителей (как раньше на «Учителя»,
 * управление профилями не потеряно: добавить/редактировать/архивировать/
 * импорт). Клик по учителю — его группы (TeacherGroupsList, тот же
 * компонент, что и в «Студенты → Все ученики → учитель»), вместо перехода
 * в TeacherDetailPage-заглушку. Полные страницы /groups и /teachers/:id
 * никуда не делись — просто больше не входная точка из меню.
 */
export function TeachersAndGroupsPage() {
  const { user, staff } = useAuth();
  const { isTeacher } = useRole();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const teacherId = isTeacher ? staff?.teacherId ?? null : searchParams.get('teacher') || null;

  const teachersQuery = useMemo(() => {
    if (!db || !activeBranchId || isTeacher) return null;
    return query(
      collection(db, 'teachers'),
      where('branchIds', 'array-contains', activeBranchId),
      where('isArchived', '==', false),
      orderBy('displayName'),
    );
  }, [activeBranchId, isTeacher]);
  const { data: teachers, loading, error } = useCollection(teachersQuery);

  const enrollmentsQuery = useMemo(
    () =>
      db && activeBranchId && !isTeacher
        ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false))
        : null,
    [activeBranchId, isTeacher],
  );
  const { data: enrollments } = useCollection(enrollmentsQuery);

  const studentsCountByTeacher = useMemo(() => {
    const map = new Map();
    for (const e of enrollments) {
      if (e.status !== 'active') continue;
      if (!map.has(e.teacherId)) map.set(e.teacherId, new Set());
      map.get(e.teacherId).add(e.studentId);
    }
    const counts = new Map();
    for (const [teacherId, ids] of map) counts.set(teacherId, ids.size);
    return counts;
  }, [enrollments]);

  const sortedTeachers = useMemo(
    () => [...teachers].sort((a, b) => (studentsCountByTeacher.get(b.id) ?? 0) - (studentsCountByTeacher.get(a.id) ?? 0)),
    [teachers, studentsCountByTeacher],
  );

  const [bannerDismissed, setBannerDismissed] = useState(() => localStorage.getItem(BANNER_KEY) === '1');
  const [modalTeacher, setModalTeacher] = useState(null);
  const [modalGroup, setModalGroup] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const dismissBanner = () => {
    localStorage.setItem(BANNER_KEY, '1');
    setBannerDismissed(true);
  };

  const openTeacher = (id) => setSearchParams(id ? { teacher: id } : {});

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

  const selectedTeacher = teachers.find((t) => t.id === teacherId);

  return (
    <>
      <PageHeader
        title={isTeacher ? 'Мои группы сегодня' : teacherId ? selectedTeacher?.displayName ?? 'Учитель' : 'Учителя и группы'}
        count={teacherId ? undefined : teachers.length}
        actions={
          teacherId ? (
            !isTeacher && (
              <Button onClick={() => setModalGroup({})}>
                <Plus className="h-4 w-4" /> Добавить
              </Button>
            )
          ) : (
            <>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <UploadCloud className="h-4 w-4" /> Import
              </Button>
              <Button onClick={() => setModalTeacher({})}>
                <Plus className="h-4 w-4" /> Добавить учителя
              </Button>
            </>
          )
        }
      />

      {teacherId && !isTeacher && (
        <button type="button" onClick={() => openTeacher(null)} className="mb-6 flex items-center gap-1 text-[15px] text-link">
          <ArrowLeft className="h-4 w-4" /> Учителя и группы — назад
        </button>
      )}

      {isTeacher && !teacherId ? (
        <EmptyState icon={GraduationCap} title="Аккаунт не привязан к профилю учителя — обратитесь к администратору" />
      ) : teacherId ? (
        <TeacherGroupsList teacherId={teacherId} branchId={activeBranchId} todayOnly={isTeacher} />
      ) : (
        <>
          {!bannerDismissed && (
            <div className="mb-6 flex items-start gap-3 rounded-card bg-success-bg p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="flex-1">
                <p className="font-bold text-success">Внимание!</p>
                <p className="text-[15px] text-success">CEO профилями можно связать учителя с другим филиалом.</p>
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
              {sortedTeachers.map((t) => (
                <Card key={t.id} hoverable className="flex h-[88px] cursor-pointer items-center justify-between p-4" onClick={() => openTeacher(t.id)}>
                  <span className="font-bold text-text">{t.displayName}</span>
                  <a href={`tel:+${t.phone}`} onClick={(e) => e.stopPropagation()} className="text-[15px] text-link">
                    {formatPhone(t.phone)}
                  </a>
                  <span className="text-[15px] text-muted">
                    {studentsCountByTeacher.get(t.id) ?? 0} {pluralize(studentsCountByTeacher.get(t.id) ?? 0, ['студент', 'студента', 'студентов'])}
                  </span>
                  <DropdownMenu
                    items={[
                      { label: 'Редактировать', onClick: () => setModalTeacher(t) },
                      { label: 'Архивировать', onClick: () => requestArchive(t), danger: true },
                    ]}
                  />
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <TeacherFormModal teacher={modalTeacher} onClose={() => setModalTeacher(null)} />

      <GroupFormModal group={modalGroup} onClose={() => setModalGroup(null)} />

      <ImportTeachersModal open={importOpen} onClose={() => setImportOpen(false)} teachers={teachers} branchId={activeBranchId} userId={user.uid} />

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
