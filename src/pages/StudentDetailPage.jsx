import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Pencil, Mail, Archive, History, Flag, FolderPlus, Wallet, CircleUserRound, RefreshCw, Trash2, Image as ImageIcon, ChevronDown } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useRole } from '../hooks/useRole.js';
import { useBranch } from '../hooks/useBranch.js';
import { useDoc } from '../hooks/useDoc.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Button } from '../components/ui/Button.jsx';
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { AddToGroupModal } from '../components/students/AddToGroupModal.jsx';
import { EnrollmentCard } from '../components/students/EnrollmentCard.jsx';
import { FreezeEnrollmentModal } from '../components/students/FreezeEnrollmentModal.jsx';
import { LeaveGroupModal } from '../components/students/LeaveGroupModal.jsx';
import { TransferGroupModal } from '../components/students/TransferGroupModal.jsx';
import { UnfreezeEnrollmentModal } from '../components/students/UnfreezeEnrollmentModal.jsx';
import { ActivateEnrollmentModal } from '../components/groups/ActivateEnrollmentModal.jsx';
import { AddPaymentModal } from '../components/students/AddPaymentModal.jsx';
import { MaterialPaymentModal } from '../components/students/MaterialPaymentModal.jsx';
import { ManualChargeModal } from '../components/students/ManualChargeModal.jsx';
import { EditChargeModal } from '../components/students/EditChargeModal.jsx';
import { EditPaymentMethodModal } from '../components/students/EditPaymentMethodModal.jsx';
import { CommentsTab } from '../components/shared/CommentsTab.jsx';
import { HistoryTab } from '../components/shared/HistoryTab.jsx';
import { CallLogsTab } from '../components/students/CallLogsTab.jsx';
import { recalcBalance, deleteTransaction } from '../lib/billing.js';
import { archiveStudent } from '../lib/students.js';
import { formatDateLong, formatDate, formatDateTimeShort, formatMoney, formatMoneySigned, formatMonth, formatPhone, formatMethod } from '../lib/format.js';

const TABS = [
  { key: 'groups', label: 'Группы' },
  { key: 'comments', label: 'Комментарии' },
  { key: 'calls', label: 'История звонков' },
  { key: 'sms', label: 'SMS' },
  { key: 'history', label: 'История' },
  { key: 'application', label: 'История заявки' },
];

function BalanceBadge({ balance }) {
  const tone = balance < 0 ? 'bg-danger-bg text-white' : balance > 0 ? 'bg-success-bg text-success' : 'bg-surface-alt text-muted';
  return <span className={`inline-block rounded-full px-4 py-1 text-[15px] font-bold ${tone}`}>{formatMoney(balance)}</span>;
}

export function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useRole();
  const { branches, activeBranchId } = useBranch();
  const { showToast } = useToast();

  const studentRef = useMemo(() => (db ? doc(db, 'students', id) : null), [id]);
  const { data: student, loading, error } = useDoc(studentRef);

  const enrollmentsQuery = useMemo(
    () => (db ? query(collection(db, 'enrollments'), where('studentId', '==', id), where('isArchived', '==', false)) : null),
    [id],
  );
  const { data: enrollments } = useCollection(enrollmentsQuery);

  const transactionsQuery = useMemo(
    () => (db ? query(collection(db, 'transactions'), where('studentId', '==', id), orderBy('date', 'desc')) : null),
    [id],
  );
  const { data: transactions } = useCollection(transactionsQuery);

  const monthlyBalancesQuery = useMemo(
    () => (db ? query(collection(db, 'monthlyBalances'), where('studentId', '==', id), orderBy('month', 'desc')) : null),
    [id],
  );
  const { data: monthlyBalances } = useCollection(monthlyBalancesQuery);

  // Для подписи «кто и когда оставил заметку» — имя резолвится с этой доски,
  // само поле noteUpdatedBy на студенте хранит только uid.
  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const staffName = (uid) => staffList.find((s) => s.id === uid)?.fullName ?? null;

  const [tab, setTab] = useState('groups');
  const [showLeftGroups, setShowLeftGroups] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState(null);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [activateTarget, setActivateTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [unfreezeTarget, setUnfreezeTarget] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [note, setNote] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [materialPaymentOpen, setMaterialPaymentOpen] = useState(false);
  const [manualChargeOpen, setManualChargeOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [editTxTarget, setEditTxTarget] = useState(null);
  const [methodTarget, setMethodTarget] = useState(null);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error) return <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>;
  if (!student) return <EmptyState icon={CircleUserRound} title="Студент не найден" />;

  const noteValue = note || student.note || '';
  const branchName = branches.find((b) => b.id === student.branchId)?.name ?? student.branchId;

  const saveNote = async () => {
    if (noteValue === student.note) return;
    try {
      // Отдельные noteUpdatedAt/noteUpdatedBy, а не общие updatedAt/updatedBy —
      // те правятся при любом изменении студента (баланс, статус и т.д.),
      // подписью «кто/когда оставил заметку» быть не могут.
      await updateDoc(doc(db, 'students', id), {
        note: noteValue,
        noteUpdatedAt: serverTimestamp(),
        noteUpdatedBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    } catch {
      showToast('Не удалось сохранить заметку.', { type: 'error' });
    }
  };

  const toggleFlag = async () => {
    try {
      await updateDoc(doc(db, 'students', id), { isFlagged: !student.isFlagged, updatedAt: serverTimestamp(), updatedBy: user.uid });
    } catch {
      showToast('Не удалось обновить флажок.', { type: 'error' });
    }
  };

  const handleRecalcBalance = async () => {
    setRecalculating(true);
    try {
      const total = await recalcBalance(db, id);
      showToast(`Баланс пересчитан: ${formatMoney(total)}.`);
    } catch {
      showToast('Не удалось пересчитать баланс.', { type: 'error' });
    } finally {
      setRecalculating(false);
    }
  };

  const confirmDeleteTx = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTransaction(db, deleteTarget);
      showToast('Транзакция удалена.');
    } catch {
      showToast('Не удалось удалить.', { type: 'error' });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const confirmArchive = async () => {
    setArchiving(true);
    try {
      await archiveStudent(db, student, user);
      showToast('Студент перенесён в архив.');
      navigate('/students');
    } catch {
      showToast('Не удалось архивировать студента.', { type: 'error' });
    } finally {
      setArchiving(false);
      setArchiveOpen(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => navigate(-1)} className="mb-4 flex items-center gap-1 text-[15px] text-muted hover:text-text">
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="flex flex-col gap-4">
          <div className="flex items-stretch justify-between">
            <div className="flex flex-col items-start gap-3">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-surface-alt text-muted">
                <ImageIcon className="h-8 w-8" strokeWidth={1.5} />
              </span>
              <div>
                <p className="text-[20px] font-bold text-text">{student.fullName}</p>
                <p className="text-[13px] text-muted">(id: {student.publicId})</p>
              </div>
            </div>
            <div className="flex flex-col justify-between">
              <Button variant="icon-round" tone="navy" onClick={() => setEditing(true)} aria-label="Редактировать">
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="icon-round" tone="warning" onClick={() => showToast('Появится в фазе 7.')} aria-label="Написать">
                <Mail className="h-4 w-4" />
              </Button>
              <Button variant="icon-round" tone="danger" onClick={() => setArchiveOpen(true)} aria-label="В архив">
                <Archive className="h-4 w-4" />
              </Button>
              <Button variant="icon-round" tone="warning" onClick={() => showToast('Появится в фазе 7.')} aria-label="История">
                <History className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <BalanceBadge balance={student.balance} />
            <span className="text-[15px] text-muted">баланс</span>
            <Button variant="icon-round" tone="navy" onClick={handleRecalcBalance} loading={recalculating} aria-label="Пересчитать баланс">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <span className="text-[13px] text-muted">Телефон: </span>
            <a href={`tel:+${student.phone}`} className="text-[15px] text-link">
              {formatPhone(student.phone)}
            </a>
          </div>
          <div>
            <span className="text-[13px] text-muted">Дата добавления: </span>
            <span className="text-[15px] text-text">{formatDateLong(student.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">Филиалы: </span>
            <Badge variant="group-code">{branchName}</Badge>
          </div>

          {/* overflow-hidden тут раньше клипал выпадающее меню DropdownMenu
              (оно absolute-позиционировано внутри этого же контейнера) — меню
              открывалось логически, но было визуально обрезано скруглённой
              «таблеткой». Форма пилюли теперь — rounded-l-full/rounded-r-full
              на самих кнопках, без overflow-hidden на обёртке. */}
          <div className="flex w-fit items-stretch rounded-full border border-navy">
            <button
              type="button"
              onClick={() => setAddToGroupOpen(true)}
              className="flex items-center gap-2 rounded-l-full px-4 text-[15px] font-bold text-navy hover:bg-orange-soft/40"
            >
              <FolderPlus className="h-4 w-4" /> Добавить в группу
            </button>
            <DropdownMenu
              variant="chevron"
              items={[
                { label: 'В существующую группу', onClick: () => setAddToGroupOpen(true) },
                { label: 'Создать новую группу', onClick: () => navigate('/groups') },
              ]}
            />
          </div>
          <div className="flex w-fit items-stretch rounded-full border border-navy">
            <button
              type="button"
              onClick={() => setPaymentOpen(true)}
              className="flex items-center gap-2 rounded-l-full px-4 text-[15px] font-bold text-navy hover:bg-orange-soft/40"
            >
              <Wallet className="h-4 w-4" /> Добавить оплату
            </button>
            <DropdownMenu
              variant="chevron"
              items={[{ label: 'Оплата учебных материалов', onClick: () => setMaterialPaymentOpen(true) }]}
            />
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setManualChargeOpen(true)}
              className="flex w-fit items-center gap-2 rounded-full border border-navy px-4 py-2 text-[15px] font-bold text-navy hover:bg-orange-soft/40"
            >
              <Wallet className="h-4 w-4" /> Ручное списание
            </button>
          )}

          <div className="rounded-r-field border-l-4 border-l-navy bg-surface-alt/40 py-2 pl-3 pr-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[13px] text-muted">Заметка</span>
              <button type="button" onClick={toggleFlag} aria-label="На контроле">
                <Flag className={`h-4 w-4 ${student.isFlagged ? 'fill-orange text-orange' : 'text-muted'}`} />
              </button>
            </div>
            <textarea
              className="min-h-20 w-full resize-none bg-transparent text-[15px] text-text focus:outline-none"
              value={noteValue}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
            />
            {student.noteUpdatedAt && (
              <p className="mt-1 text-[12px] text-muted">
                {staffName(student.noteUpdatedBy) ?? 'Неизвестный'} · {formatDateTimeShort(student.noteUpdatedAt)}
              </p>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <Tabs tabs={TABS} activeKey={tab} onChange={setTab} />
            <div className="mt-6">
              {tab === 'groups' ? (
                <div className="flex flex-col gap-6">
                  {enrollments.length === 0 ? (
                    <EmptyState icon={CircleUserRound} title="Пока нет записей в группы" actionLabel="Добавить в группу" onAction={() => setAddToGroupOpen(true)} />
                  ) : (
                    <div className="flex flex-col gap-4">
                      {enrollments
                        .filter((e) => showLeftGroups || e.status !== 'left')
                        .map((e) => (
                          <EnrollmentCard
                            key={e.id}
                            enrollment={e}
                            studentBalance={student.balance}
                            studentFreezeCount={student.freezeCount}
                            onFreeze={setFreezeTarget}
                            onLeave={setLeaveTarget}
                            onActivate={setActivateTarget}
                            onUnfreeze={setUnfreezeTarget}
                            onTransfer={setTransferTarget}
                          />
                        ))}
                      {enrollments.some((e) => e.status === 'left') && (
                        <button
                          type="button"
                          onClick={() => setShowLeftGroups((v) => !v)}
                          className="self-start text-[13px] text-link hover:underline"
                        >
                          {showLeftGroups ? 'Скрыть покинутые группы' : 'Показать покинутые группы'}
                        </button>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="mb-3 text-[15px] font-bold text-text">Статус баланса за месяц</h3>
                    {monthlyBalances.length === 0 ? (
                      <EmptyState icon={Wallet} title="Пока нет начислений" />
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {monthlyBalances.map((mb) => (
                          <div
                            key={mb.id}
                            className={`min-w-32 shrink-0 rounded-field border p-3 text-center ${
                              mb.balance > 0 ? 'border-success' : 'border-danger'
                            }`}
                          >
                            <p className="text-[13px] text-muted">{formatMonth(mb.month)}</p>
                            <p className={`text-[15px] font-bold ${mb.balance > 0 ? 'text-success' : 'text-danger'}`}>
                              {formatMoney(mb.balance)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-3 text-[15px] font-bold text-text">Платежи</h3>
                    {transactions.length === 0 ? (
                      <EmptyState icon={Wallet} title="Пока нет платежей" />
                    ) : (
                      <Table
                        columns={[
                          { key: 'date', label: 'Дата', width: '90px', render: (t) => formatDate(t.date) },
                          {
                            key: 'type',
                            label: 'Тип',
                            width: '100px',
                            render: (t) => (
                              <Badge variant={t.type === 'payment' ? 'type-payment' : 'type-system'}>
                                {t.type === 'payment' ? 'оплата' : t.type === 'correction' ? 'коррекция' : 'система'}
                              </Badge>
                            ),
                          },
                          {
                            key: 'amount',
                            label: 'Сумма',
                            width: '110px',
                            render: (t) => (
                              <span className={t.amount < 0 ? 'text-danger' : 'text-success'}>{formatMoneySigned(t.amount)}</span>
                            ),
                          },
                          {
                            key: 'method',
                            label: 'Метод',
                            width: '90px',
                            render: (t) => (t.type === 'payment' ? formatMethod(t.method) : '—'),
                          },
                          {
                            key: 'comment',
                            label: 'Комментарий',
                            width: 'minmax(160px, 300px)',
                            render: (t) => (
                              <span className="flex min-w-0 flex-wrap items-center gap-1 break-words">
                                {t.groupCode && <Badge variant="group-code">{t.groupCode}</Badge>}
                                {t.comment}
                              </span>
                            ),
                          },
                          {
                            key: 'createdByName',
                            label: 'Сотрудник',
                            width: '130px',
                            render: (t) => (
                              <span>
                                {t.createdByName}
                                <br />
                                <span className="text-muted">{formatDateTimeShort(t.createdAt)}</span>
                              </span>
                            ),
                          },
                          ...(isAdmin
                            ? [
                                {
                                  key: '__actions',
                                  label: '',
                                  width: '72px',
                                  render: (t) => (
                                    <span className="flex items-center gap-2">
                                      {t.type !== 'payment' ? (
                                        <button
                                          type="button"
                                          onClick={() => setEditTxTarget(t)}
                                          aria-label="Исправить списание"
                                          className="text-muted hover:text-navy"
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setMethodTarget(t)}
                                          aria-label="Изменить способ оплаты"
                                          className="text-muted hover:text-navy"
                                        >
                                          <Wallet className="h-4 w-4" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(t)}
                                        aria-label="Удалить"
                                        className="text-muted hover:text-danger"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </span>
                                  ),
                                },
                              ]
                            : []),
                        ]}
                        rows={transactions}
                      />
                    )}
                  </div>
                </div>
              ) : tab === 'comments' ? (
                <CommentsTab entityType="student" entityId={id} />
              ) : tab === 'history' ? (
                <HistoryTab entityType="student" entityId={id} />
              ) : tab === 'calls' ? (
                <CallLogsTab studentId={id} />
              ) : (
                <EmptyState icon={CircleUserRound} title="Раздел появится позже" />
              )}
            </div>
          </Card>
        </div>
      </div>

      <StudentFormModal student={editing ? student : null} onClose={() => setEditing(false)} />
      <AddToGroupModal open={addToGroupOpen} student={student} onClose={() => setAddToGroupOpen(false)} />
      <FreezeEnrollmentModal
        enrollment={freezeTarget}
        studentBalance={student.balance}
        studentFreezeCount={student.freezeCount}
        onClose={() => setFreezeTarget(null)}
      />
      <LeaveGroupModal enrollment={leaveTarget} onClose={() => setLeaveTarget(null)} />
      <TransferGroupModal enrollment={transferTarget} student={student} onClose={() => setTransferTarget(null)} />
      <UnfreezeEnrollmentModal enrollment={unfreezeTarget} onClose={() => setUnfreezeTarget(null)} />
      <ActivateEnrollmentModal
        enrollment={activateTarget}
        student={student}
        onClose={() => setActivateTarget(null)}
      />
      <AddPaymentModal open={paymentOpen} student={student} enrollments={enrollments} onClose={() => setPaymentOpen(false)} />
      <MaterialPaymentModal open={materialPaymentOpen} student={student} onClose={() => setMaterialPaymentOpen(false)} />
      {isAdmin && (
        <>
          <ManualChargeModal open={manualChargeOpen} student={student} onClose={() => setManualChargeOpen(false)} />
          <EditChargeModal open={Boolean(editTxTarget)} transaction={editTxTarget} onClose={() => setEditTxTarget(null)} />
          <EditPaymentMethodModal open={Boolean(methodTarget)} transaction={methodTarget} onClose={() => setMethodTarget(null)} />
        </>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
        loading={archiving}
        title="Архивировать студента"
        message={`Перенести «${student.fullName}» в архив? История и записи останутся доступны.`}
        confirmLabel="В архив"
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteTx}
        loading={deleting}
        title="Удалить транзакцию"
        message={deleteTarget ? `Удалить ${deleteTarget.type === 'payment' ? 'платёж' : 'списание'} на ${formatMoney(Math.abs(deleteTarget.amount))} от ${formatDate(deleteTarget.date)}? Баланс студента пересчитается.` : ''}
        confirmLabel="Удалить"
      />
    </>
  );
}
