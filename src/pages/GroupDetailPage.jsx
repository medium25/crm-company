import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, documentId, query, where, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { Pencil, Archive, Mail, UserPlus, History, Users } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useDoc } from '../hooks/useDoc.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Table } from '../components/ui/Table.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { GroupFormModal } from '../components/groups/GroupFormModal.jsx';
import { AttendanceTab } from '../components/groups/AttendanceTab.jsx';
import { GradesTab } from '../components/groups/GradesTab.jsx';
import { ExamsTab } from '../components/groups/ExamsTab.jsx';
import { CommentsTab } from '../components/shared/CommentsTab.jsx';
import { HistoryTab } from '../components/shared/HistoryTab.jsx';
import { SmsSendModal } from '../components/shared/SmsSendModal.jsx';
import { FreezeEnrollmentModal } from '../components/students/FreezeEnrollmentModal.jsx';
import { LeaveGroupModal } from '../components/students/LeaveGroupModal.jsx';
import { TransferGroupModal } from '../components/students/TransferGroupModal.jsx';
import { ActivateEnrollmentModal } from '../components/groups/ActivateEnrollmentModal.jsx';
import { formatDate, formatMoney, formatScheduleType } from '../lib/format.js';
import { toCsv, downloadCsv } from '../lib/csv.js';
import { BackButton } from '../components/ui/BackButton.jsx';

const TABS = [
  { key: 'attendance', label: 'Посещаемость' },
  { key: 'grades', label: 'Оценка' },
  { key: 'materials', label: 'Онлайн-уроки и материалы' },
  { key: 'pricing', label: 'Цены со скидкой' },
  { key: 'exams', label: 'Экзамены' },
  { key: 'history', label: 'История' },
  { key: 'comments', label: 'Комментарии' },
];

function pricingColumns(groupPrice) {
  return [
    { key: 'studentName', label: 'Студент' },
    { key: 'groupPrice', label: 'Цена группы', render: () => formatMoney(groupPrice) },
    { key: 'price', label: 'Цена студента', render: (e) => formatMoney(e.price) },
    { key: 'discountPercent', label: 'Скидка %', render: (e) => `${e.discountPercent ?? 0}%` },
    { key: 'updatedBy', label: 'Кто изменил', render: (e) => e.updatedBy ?? '—' },
    { key: 'updatedAt', label: 'Когда', render: (e) => formatDate(e.updatedAt) },
  ];
}

export function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const groupRef = useMemo(() => (db ? doc(db, 'groups', id) : null), [id]);
  const { data: group, loading, error } = useDoc(groupRef);

  const roomRef = useMemo(() => (db && group?.roomId ? doc(db, 'rooms', group.roomId) : null), [group?.roomId]);
  const { data: room } = useDoc(roomRef);

  const [tab, setTab] = useState('attendance');
  const [sort, setSort] = useState('name');
  const [showArchivedStudents, setShowArchivedStudents] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState(null);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [activateTarget, setActivateTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);

  const enrollmentsQuery = useMemo(() => {
    if (!db) return null;
    const clauses = [where('groupId', '==', id)];
    if (!showArchivedStudents) clauses.push(where('status', '!=', 'archived'));
    return query(collection(db, 'enrollments'), ...clauses);
  }, [id, showArchivedStudents]);
  const { data: rawEnrollments } = useCollection(enrollmentsQuery);

  const studentIds = useMemo(() => rawEnrollments.map((e) => e.studentId).slice(0, 30), [rawEnrollments]);
  const studentsQuery = useMemo(
    () => (db && studentIds.length > 0 ? query(collection(db, 'students'), where(documentId(), 'in', studentIds)) : null),
    [studentIds],
  );
  const { data: rosterStudents } = useCollection(studentsQuery);
  const studentsById = useMemo(() => new Map(rosterStudents.map((s) => [s.id, s])), [rosterStudents]);
  // enrollments.studentName — копия имени на момент записи в группу: если фамилию дописали
  // позже, копия остаётся короткой. Показываем актуальное имя из карточки студента.
  const enrollments = useMemo(
    () => rawEnrollments.map((e) => ({ ...e, studentName: studentsById.get(e.studentId)?.fullName ?? e.studentName })),
    [rawEnrollments, studentsById],
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-control text-danger">Не удалось загрузить. Проверьте соединение.</p>;
  if (!group) return <EmptyState icon={Users} title="Группа не найдена" />;

  const exportRoster = () => {
    const columns = [
      { key: 'studentName', label: 'Студент', value: (e) => e.studentName },
      { key: 'status', label: 'Статус', value: (e) => e.statusLabel || e.status },
      { key: 'price', label: 'Цена', value: (e) => e.price },
      { key: 'addedAt', label: 'Дата добавления', value: (e) => formatDate(e.addedAt) },
      { key: 'activatedAt', label: 'Дата активации', value: (e) => (e.activatedAt ? formatDate(e.activatedAt) : '') },
    ];
    downloadCsv(`${group.code}-состав.csv`, toCsv(columns, enrollments));
  };

  const confirmArchive = async () => {
    setArchiving(true);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'groups', group.id), {
        isArchived: true,
        status: 'archived',
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      if (group.teacherId) {
        batch.update(doc(db, 'teachers', group.teacherId), { groupsCount: increment(-1) });
      }
      await batch.commit();
      showToast('Группа перенесена в архив.');
      setConfirmArchiveOpen(false);
      navigate('/groups');
    } catch {
      showToast('Не удалось архивировать группу.', { type: 'error' });
    } finally {
      setArchiving(false);
    }
  };

  return (
    <>
      <BackButton onClick={() => navigate(-1)} className="mb-4">
        Назад
      </BackButton>

      <h1 className="mb-6 text-kpi text-text">
        {group.code} <span className="text-muted">·</span> {group.courseName} <span className="text-muted">·</span>{' '}
        {group.teacherName}
      </h1>

      {/* Один раздел: сверху данные группы и кнопки действий, ниже вкладки с таблицей на всю ширину. */}
      <Card className="min-w-0">
        <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
            <Field label="Курс" value={group.courseName} />
            <Field label="Учитель" value={group.teacherName} />
            <Field label="Цена" value={formatMoney(group.price)} />
            <Field label="Время" value={`${formatScheduleType(group.schedule.type)} · ${group.schedule.time}`} />
            <Field label="Кабинеты" value={group.roomName || '—'} />
            <Field label="Вместимость комнаты" value={room ? `${room.capacity}` : '—'} />
            <Field label="Даты обучения" value={`${formatDate(group.startDate)} — ${formatDate(group.endDate)}`} />
            <Field label="Филиалы" value={group.branchId} />
            <p className="text-small text-muted">(id: {group.publicId})</p>
          </div>

          <div className="flex shrink-0 flex-row flex-wrap gap-2">
            <Button variant="icon-round" tone="navy" onClick={() => setEditing(true)} aria-label="Редактировать">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="icon-round" tone="danger" onClick={() => setConfirmArchiveOpen(true)} aria-label="Архивировать">
              <Archive className="h-4 w-4" />
            </Button>
            <Button variant="icon-round" tone="warning" onClick={() => setSmsOpen(true)} aria-label="SMS группе">
              <Mail className="h-4 w-4" />
            </Button>
            <Button variant="icon-round" tone="navy" onClick={() => showToast('Появится в фазе 3.')} aria-label="Добавить студента">
              <UserPlus className="h-4 w-4" />
            </Button>
            <Button variant="icon-round" tone="warning" onClick={() => showToast('Появится в фазе 7.')} aria-label="История изменений">
              <History className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <Tabs tabs={TABS} activeKey={tab} onChange={setTab} />
          <div className="mt-6">
            {tab === 'attendance' ? (
              <AttendanceTab
                group={group}
                rosterActions={{ onFreeze: setFreezeTarget, onLeave: setLeaveTarget, onActivate: setActivateTarget, onTransfer: setTransferTarget }}
                sort={sort}
                onSortChange={setSort}
                showArchived={showArchivedStudents}
                onToggleArchived={() => setShowArchivedStudents((v) => !v)}
                onExport={exportRoster}
                exportDisabled={enrollments.length === 0}
              />
            ) : tab === 'pricing' ? (
              enrollments.length === 0 ? (
                <EmptyState icon={Users} title="Пока нет студентов со скидкой" />
              ) : (
                <Table columns={pricingColumns(group.price)} rows={enrollments} />
              )
            ) : tab === 'grades' ? (
              <GradesTab group={group} enrollments={enrollments} />
            ) : tab === 'exams' ? (
              <ExamsTab group={group} enrollments={enrollments} />
            ) : tab === 'comments' ? (
              <CommentsTab entityType="group" entityId={group.id} />
            ) : tab === 'history' ? (
              <HistoryTab entityType="group" entityId={group.id} />
            ) : (
              <EmptyState icon={Users} title="Раздел появится позже" />
            )}
          </div>
        </div>
      </Card>

      <GroupFormModal group={editing ? group : null} onClose={() => setEditing(false)} />
      <FreezeEnrollmentModal
        enrollment={freezeTarget}
        studentBalance={studentsById.get(freezeTarget?.studentId)?.balance}
        studentFreezeCount={studentsById.get(freezeTarget?.studentId)?.freezeCount}
        onClose={() => setFreezeTarget(null)}
      />
      <LeaveGroupModal enrollment={leaveTarget} onClose={() => setLeaveTarget(null)} />
      <ActivateEnrollmentModal
        enrollment={activateTarget}
        student={studentsById.get(activateTarget?.studentId)}
        onClose={() => setActivateTarget(null)}
      />
      <TransferGroupModal
        enrollment={transferTarget}
        student={studentsById.get(transferTarget?.studentId)}
        onClose={() => setTransferTarget(null)}
      />

      <SmsSendModal
        open={smsOpen}
        onClose={() => setSmsOpen(false)}
        recipients={enrollments.map((e) => ({ studentId: e.studentId, studentName: e.studentName }))}
        groupId={group.id}
        branchId={group.branchId}
      />

      <ConfirmDialog
        open={confirmArchiveOpen}
        onClose={() => setConfirmArchiveOpen(false)}
        onConfirm={confirmArchive}
        loading={archiving}
        title="Архивировать группу"
        message={`Архивировать группу «${group.code}»? Студенты и история останутся доступны.`}
        confirmLabel="Архивировать"
      />
    </>
  );
}

function Field({ label, value }) {
  return (
    <p className="text-control text-text">
      <span className="font-bold">{label}: </span>
      {value}
    </p>
  );
}
