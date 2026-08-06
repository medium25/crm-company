import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ShieldCheck } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Table } from '../ui/Table.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { formatPhone, formatMoney, formatDate } from '../../lib/format.js';

const STATUS_LABEL = { active: 'Активен', paused: 'Заморожен', trial: 'Пробный', left: 'Ушёл' };

/**
 * Раздел ручной сверки со старой системой — список активных студентов,
 * ещё не отмеченных проверенными. Владелец сравнивает карточку с modme и
 * жмёт «Проверено»; после подтверждения студент помечается
 * chargeHistoryReviewed и пропадает из списка. Список опустеет — раздел
 * можно будет убрать вовсе.
 */
export function NoChargeHistoryList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const studentsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('status', '==', 'active'),
          )
        : null,
    [activeBranchId],
  );
  const { data: students, loading: studentsLoading } = useCollection(studentsQuery);

  const enrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: enrollments, loading: enrollmentsLoading } = useCollection(enrollmentsQuery);

  const loading = studentsLoading || enrollmentsLoading;

  const enrollmentsByStudent = useMemo(() => {
    const map = new Map();
    for (const e of enrollments) {
      if (e.status === 'left' || e.status === 'archived') continue;
      if (!map.has(e.studentId)) map.set(e.studentId, []);
      map.get(e.studentId).push(e);
    }
    return map;
  }, [enrollments]);

  const rows = useMemo(() => students.filter((s) => !s.chargeHistoryReviewed), [students]);

  const confirmVerified = async () => {
    if (!confirmTarget) return;
    setConfirming(true);
    try {
      await updateDoc(doc(db, 'students', confirmTarget.id), {
        chargeHistoryReviewed: true,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      setConfirmTarget(null);
    } catch {
      showToast('Не удалось отметить.', { type: 'error' });
    } finally {
      setConfirming(false);
    }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  const columns = [
    {
      key: 'fullName',
      label: 'Имя',
      render: (st) => <span className="font-bold text-text">{st.fullName}</span>,
    },
    {
      key: 'phone',
      label: 'Телефон',
      render: (st) => (
        <a href={`tel:+${st.phone}`} onClick={(e) => e.stopPropagation()} className="text-link">
          {formatPhone(st.phone)}
        </a>
      ),
    },
    {
      key: 'status',
      label: 'Статус',
      render: (st) => STATUS_LABEL[st.status] ?? st.status,
    },
    {
      key: 'balance',
      label: 'Баланс',
      render: (st) => <span className={st.balance < 0 ? 'text-danger' : 'text-success'}>{formatMoney(st.balance)}</span>,
    },
    {
      key: 'groups',
      label: 'Группы',
      render: (st) => (
        <span className="flex flex-wrap gap-1">
          {(enrollmentsByStudent.get(st.id) ?? []).map((e) => (
            <Badge key={e.id} variant="group-code">
              {e.groupCode}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Дата зачисления',
      render: (st) => formatDate(st.createdAt),
    },
    {
      key: '__actions',
      label: '',
      width: '160px',
      render: (st) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" className="h-8 px-3 text-[13px]" onClick={() => setConfirmTarget(st)}>
            Проверено
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <p className="mb-4 text-[13px] text-muted">
        Сверка со старой системой — {rows.length} активных студентов. Открой карточку, сравни баланс и историю
        списаний с modme, затем нажми «Проверено». Список опустеет — сверка завершена.
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="Все проверены" />
      ) : (
        <Table columns={columns} rows={rows} onRowClick={(st) => navigate(`/students/${st.id}`)} />
      )}

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onClose={() => setConfirmTarget(null)}
        onConfirm={confirmVerified}
        loading={confirming}
        title="Отметить проверенным"
        message={`Точно убрать «${confirmTarget?.fullName}» из списка сверки?`}
        confirmLabel="Проверено"
      />
    </div>
  );
}
