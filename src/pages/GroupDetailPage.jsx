import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, documentId, query, where, writeBatch, increment, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Pencil, Archive, Mail, UserPlus, History, Download, Users } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useDoc } from '../hooks/useDoc.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Table } from '../components/ui/Table.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
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
import { formatDate, formatMoney, formatPhone, formatScheduleType } from '../lib/format.js';
import { toCsv, downloadCsv } from '../lib/csv.js';
import { MIN_FREEZE_BALANCE, MAX_FREEZES_PER_STUDENT, canFreezeStudent } from '../lib/billing.js';

const TABS = [
  { key: 'attendance', label: 'Посещаемость' },
  { key: 'grades', label: 'Оценка' },
  { key: 'materials', label: 'Онлайн-уроки и материалы' },
  { key: 'pricing', label: 'Цены со скидкой' },
  { key: 'exams', label: 'Экзамены' },
  { key: 'history', label: 'История' },
  { key: 'comments', label: 'Комментарии' },
];

const SORT_OPTIONS = [
  { value: 'name', label: 'По А-Я' },
  { value: 'balance', label: 'По балансу' },
  { value: 'addedAt', label: 'По дате добавления' },
];

function RosterRow({ index, enrollment, student, navigate, onFreeze, onLeave, onActivate, onTransfer }) {
  const balance = student?.balance ?? 0;
  const isTrial = enrollment.status === 'trial';
  const isPaused = enrollment.status === 'paused';
  const canFreeze = canFreezeStudent(student);
  const freezeDisabledTitle =
    (student?.freezeCount ?? 0) >= MAX_FREEZES_PER_STUDENT
      ? `Лимит заморозок за весь срок обучения исчерпан (${MAX_FREEZES_PER_STUDENT} из ${MAX_FREEZES_PER_STUDENT})`
      : `Заморозка доступна при балансе от ${formatMoney(MIN_FREEZE_BALANCE)}`;

  return (
    <li className="flex items-center gap-2 text-[15px] text-text">
      <span className="w-5 shrink-0 text-right text-muted">{index}.</span>
      {isTrial || isPaused ? (
        <span className="flex-1 truncate">
          <button
            type="button"
            onClick={() => navigate(`/students/${enrollment.studentId}`)}
            className={`rounded-badge px-2 py-0.5 text-[13px] font-bold hover:opacity-80 ${
              isPaused ? 'bg-present/15 text-present' : 'bg-[#EEF0F3] text-text'
            }`}
            title={isPaused ? 'Заморожен' : 'Пробный урок'}
          >
            {enrollment.studentName}
          </button>
        </span>
      ) : (
        <>
          <span className={`h-2 w-2 shrink-0 rounded-full ${balance > 0 ? 'bg-success' : 'bg-danger'}`} title={formatMoney(balance)} />
          <button
            type="button"
            onClick={() => navigate(`/students/${enrollment.studentId}`)}
            className="flex-1 truncate text-left hover:text-link"
          >
            {enrollment.studentName}
          </button>
        </>
      )}
      {student?.phone && (
        <a href={`tel:+${student.phone}`} onClick={(e) => e.stopPropagation()} className="shrink-0 text-link">
          {formatPhone(student.phone)}
        </a>
      )}
      <DropdownMenu
        items={[
          { label: 'Открыть карточку', onClick: () => navigate(`/students/${enrollment.studentId}`) },
          ...(isTrial ? [{ label: 'Активировать', onClick: () => onActivate(enrollment) }] : []),
          ...(isPaused
            ? []
            : [
                {
                  label: 'Заморозить',
                  onClick: () => onFreeze(enrollment),
                  disabled: !canFreeze,
                  title: canFreeze ? undefined : freezeDisabledTitle,
                },
              ]),
          { label: 'Перевести в другую группу', onClick: () => onTransfer(enrollment) },
          { label: 'Убрать из группы', onClick: () => onLeave(enrollment), danger: true },
        ]}
      />
    </li>
  );
}

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
  const { data: enrollments } = useCollection(enrollmentsQuery);

  const studentIds = useMemo(() => enrollments.map((e) => e.studentId).slice(0, 30), [enrollments]);
  const studentsQuery = useMemo(
    () => (db && studentIds.length > 0 ? query(collection(db, 'students'), where(documentId(), 'in', studentIds)) : null),
    [studentIds],
  );
  const { data: rosterStudents } = useCollection(studentsQuery);
  const studentsById = useMemo(() => new Map(rosterStudents.map((s) => [s.id, s])), [rosterStudents]);

  const sortedEnrollments = useMemo(() => {
    // Студент мог быть архивирован напрямую с его карточки — тогда его
    // enrollment иногда остаётся неархивированным (старые данные до фикса
    // каскадной архивации). Подстраховка: не показываем в ростере тех, чей
    // студент фактически архивен.
    const list = enrollments.filter((e) => !studentsById.get(e.studentId)?.isArchived);
    if (sort === 'balance') {
      list.sort((a, b) => (studentsById.get(a.studentId)?.balance ?? 0) - (studentsById.get(b.studentId)?.balance ?? 0));
    } else if (sort === 'addedAt') {
      list.sort((a, b) => (a.addedAt?.toMillis() ?? 0) - (b.addedAt?.toMillis() ?? 0));
    } else {
      list.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ru'));
    }
    return list;
  }, [enrollments, sort, studentsById]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>;
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
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-[15px] text-muted hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      <h1 className="mb-6 text-[32px] leading-[40px] text-text">
        {group.code} <span className="text-muted">·</span> {group.courseName} <span className="text-muted">·</span>{' '}
        {group.teacherName}
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_auto_1fr]">
        <Card className="flex flex-col gap-2">
          <Field label="Курс" value={group.courseName} />
          <Field label="Учитель" value={group.teacherName} />
          <Field label="Цена" value={formatMoney(group.price)} />
          <Field label="Время" value={`${formatScheduleType(group.schedule.type)} · ${group.schedule.time}`} />
          <Field label="Кабинеты" value={group.roomName || '—'} />
          <Field label="Вместимость комнаты" value={room ? `${room.capacity}` : '—'} />
          <Field label="Даты обучения" value={`${formatDate(group.startDate)} — ${formatDate(group.endDate)}`} />
          <p className="text-[13px] text-muted">(id: {group.publicId})</p>
          <Field label="Филиалы" value={group.branchId} />

          <div className="mt-2 flex items-center justify-between border-t border-border pt-4">
            <Select options={SORT_OPTIONS} value={sort} onChange={(e) => setSort(e.target.value)} className="w-48" />
          </div>

          {sortedEnrollments.length === 0 ? (
            <EmptyState icon={Users} title="Пока нет студентов в группе" />
          ) : (
            <ul className="flex flex-col gap-2">
              {sortedEnrollments.map((e, i) => (
                <RosterRow
                  key={e.id}
                  index={i + 1}
                  enrollment={e}
                  student={studentsById.get(e.studentId)}
                  navigate={navigate}
                  onFreeze={setFreezeTarget}
                  onLeave={setLeaveTarget}
                  onActivate={setActivateTarget}
                  onTransfer={setTransferTarget}
                />
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => setShowArchivedStudents((v) => !v)} className="text-[13px] text-link">
              {showArchivedStudents ? 'Скрыть архивных студентов' : 'Показать архивных студентов'}
            </button>
            <Button variant="icon-round" tone="navy" onClick={exportRoster} aria-label="Экспорт в CSV" disabled={enrollments.length === 0}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <div className="flex flex-row gap-2 lg:flex-col">
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

        <Card>
          <Tabs tabs={TABS} activeKey={tab} onChange={setTab} />
          <div className="mt-6">
            {tab === 'attendance' ? (
              <AttendanceTab group={group} />
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
        </Card>
      </div>

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
    <p className="text-[15px] text-text">
      <span className="font-bold">{label}: </span>
      {value}
    </p>
  );
}
