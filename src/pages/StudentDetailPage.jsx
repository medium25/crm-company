import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, Pencil, Mail, Archive, History, Flag, FolderPlus, Wallet, CircleUserRound, RefreshCw } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useRole } from '../hooks/useRole.js';
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
import { AddPaymentModal } from '../components/students/AddPaymentModal.jsx';
import { ManualChargeModal } from '../components/students/ManualChargeModal.jsx';
import { ReverseTransactionModal } from '../components/students/ReverseTransactionModal.jsx';
import { CommentsTab } from '../components/shared/CommentsTab.jsx';
import { HistoryTab } from '../components/shared/HistoryTab.jsx';
import { CallLogsTab } from '../components/students/CallLogsTab.jsx';
import { recalcBalance } from '../lib/billing.js';
import { formatDateLong, formatDate, formatMoney, formatMoneySigned, formatMonth, formatPhone } from '../lib/format.js';

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
  const { isFinance } = useRole();
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

  const [tab, setTab] = useState('groups');
  const [editing, setEditing] = useState(false);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [freezeTarget, setFreezeTarget] = useState(null);
  const [leaveTarget, setLeaveTarget] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [note, setNote] = useState('');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [manualChargeOpen, setManualChargeOpen] = useState(false);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

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

  const saveNote = async () => {
    if (noteValue === student.note) return;
    try {
      await updateDoc(doc(db, 'students', id), { note: noteValue, updatedAt: serverTimestamp(), updatedBy: user.uid });
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

  const confirmArchive = async () => {
    setArchiving(true);
    try {
      await updateDoc(doc(db, 'students', id), {
        isArchived: true,
        archivedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
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
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-surface-alt text-2xl font-bold text-muted">
                {student.fullName[0]}
              </span>
              <div>
                <p className="text-[20px] font-bold text-text">{student.fullName}</p>
                <p className="text-[13px] text-muted">(id: {student.publicId})</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
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
            <Button variant="icon-round" tone="navy" onClick={handleRecalcBalance} loading={recalculating} aria-label="Пересчитать баланс">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div>
            <span className="block text-[13px] text-muted">Телефон</span>
            <a href={`tel:+${student.phone}`} className="text-[15px] text-link">
              {formatPhone(student.phone)}
            </a>
          </div>
          <div>
            <span className="block text-[13px] text-muted">Дата добавления</span>
            <span className="text-[15px] text-text">{formatDateLong(student.createdAt)}</span>
          </div>
          <div>
            <span className="block text-[13px] text-muted">Филиалы</span>
            <span className="text-[15px] text-text">{student.branchId}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <Button variant="secondary" onClick={() => setAddToGroupOpen(true)}>
              <FolderPlus className="h-4 w-4" /> Добавить в группу
            </Button>
            <DropdownMenu
              items={[
                { label: 'В существующую группу', onClick: () => setAddToGroupOpen(true) },
                { label: 'Создать новую группу', onClick: () => navigate('/groups') },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="secondary" onClick={() => setPaymentOpen(true)}>
              <Wallet className="h-4 w-4" /> Добавить оплату
            </Button>
            <DropdownMenu
              items={[
                { label: 'Оплата', onClick: () => setPaymentOpen(true) },
                ...(isFinance
                  ? [
                      { label: 'Ручное списание', onClick: () => setManualChargeOpen(true) },
                      { label: 'Сторно', onClick: () => setReverseOpen(true) },
                    ]
                  : []),
              ]}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[13px] text-muted">Заметка</span>
              <button type="button" onClick={toggleFlag} aria-label="На контроле">
                <Flag className={`h-4 w-4 ${student.isFlagged ? 'fill-orange text-orange' : 'text-muted'}`} />
              </button>
            </div>
            <textarea
              className="min-h-20 w-full rounded-field border border-border-strong p-2 text-[15px] focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
              value={noteValue}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
            />
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
                      {enrollments.map((e) => (
                        <EnrollmentCard key={e.id} enrollment={e} onFreeze={setFreezeTarget} onLeave={setLeaveTarget} />
                      ))}
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
                              mb.balance < 0 ? 'border-danger' : 'border-success'
                            }`}
                          >
                            <p className="text-[13px] text-muted">{formatMonth(mb.month)}</p>
                            <p className={`text-[15px] font-bold ${mb.balance < 0 ? 'text-danger' : 'text-success'}`}>
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
                          { key: 'date', label: 'Дата', render: (t) => formatDate(t.date) },
                          {
                            key: 'type',
                            label: 'Тип',
                            render: (t) => (
                              <Badge variant={t.type === 'payment' ? 'type-payment' : 'type-system'}>
                                {t.type === 'payment' ? 'оплата' : t.type === 'correction' ? 'коррекция' : 'система'}
                              </Badge>
                            ),
                          },
                          {
                            key: 'amount',
                            label: 'Сумма',
                            render: (t) => (
                              <span className={t.amount < 0 ? 'text-danger' : 'text-success'}>{formatMoneySigned(t.amount)}</span>
                            ),
                          },
                          {
                            key: 'comment',
                            label: 'Комментарий',
                            render: (t) => (
                              <span className="flex flex-wrap items-center gap-1">
                                {t.groupCode && <Badge variant="group-code">{t.groupCode}</Badge>}
                                {t.comment}
                                {t.isReversed && <Badge variant="status-debt">сторнировано</Badge>}
                              </span>
                            ),
                          },
                          {
                            key: 'createdByName',
                            label: 'Сотрудник',
                            render: (t) => (
                              <span>
                                {t.createdByName}
                                <br />
                                <span className="text-muted">{formatDate(t.createdAt)}</span>
                              </span>
                            ),
                          },
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
      <FreezeEnrollmentModal enrollment={freezeTarget} onClose={() => setFreezeTarget(null)} />
      <LeaveGroupModal enrollment={leaveTarget} onClose={() => setLeaveTarget(null)} />
      <AddPaymentModal open={paymentOpen} student={student} enrollments={enrollments} onClose={() => setPaymentOpen(false)} />
      {isFinance && (
        <>
          <ManualChargeModal open={manualChargeOpen} student={student} onClose={() => setManualChargeOpen(false)} />
          <ReverseTransactionModal open={reverseOpen} transactions={transactions} onClose={() => setReverseOpen(false)} />
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
    </>
  );
}
