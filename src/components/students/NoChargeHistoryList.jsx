import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Wallet } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Table } from '../ui/Table.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { ManualChargeModal } from './ManualChargeModal.jsx';
import { formatPhone, formatMoney, formatDate } from '../../lib/format.js';

const STATUS_LABEL = { active: 'Активен', paused: 'Заморожен', trial: 'Пробный', left: 'Ушёл' };

/**
 * ВРЕМЕННЫЙ раздел — студенты без единой транзакции type=charge (история
 * списаний никогда не переносилась из modme, см. переписку). Админ
 * добавляет реальные списания вручную ("Ручное списание"), затем ставит
 * "Готово" — студент пропадает из списка. После обработки всех — раздел
 * удаляется целиком (компонент + пункт меню в StudentsPage).
 */
export function NoChargeHistoryList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [chargeTarget, setChargeTarget] = useState(null);

  const studentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: students, loading: studentsLoading } = useCollection(studentsQuery);

  const chargesQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'transactions'), where('branchId', '==', activeBranchId), where('type', '==', 'charge')) : null),
    [activeBranchId],
  );
  const { data: charges, loading: chargesLoading } = useCollection(chargesQuery);

  const enrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: enrollments, loading: enrollmentsLoading } = useCollection(enrollmentsQuery);

  const loading = studentsLoading || chargesLoading || enrollmentsLoading;

  const studentIdsWithCharge = useMemo(() => new Set(charges.map((c) => c.studentId)), [charges]);
  const enrollmentsByStudent = useMemo(() => {
    const map = new Map();
    for (const e of enrollments) {
      if (e.status === 'left' || e.status === 'archived') continue;
      if (!map.has(e.studentId)) map.set(e.studentId, []);
      map.get(e.studentId).push(e);
    }
    return map;
  }, [enrollments]);

  const rows = useMemo(
    () => students.filter((s) => !studentIdsWithCharge.has(s.id) && !s.chargeHistoryReviewed),
    [students, studentIdsWithCharge],
  );

  const markDone = async (student) => {
    try {
      await updateDoc(doc(db, 'students', student.id), {
        chargeHistoryReviewed: true,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    } catch {
      showToast('Не удалось отметить.', { type: 'error' });
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
      width: '220px',
      render: (st) => (
        <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" className="h-8 px-3 text-[13px]" onClick={() => setChargeTarget(st)}>
            Ручное списание
          </Button>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">
            <input type="checkbox" onChange={() => markDone(st)} />
            Готово
          </label>
        </span>
      ),
    },
  ];

  return (
    <div>
      <p className="mb-4 text-[13px] text-muted">
        Временный раздел — {rows.length} студентов без единой перенесённой транзакции списания. Введи реальные
        списания вручную и отметь «Готово» — уйдёт из списка. Когда список опустеет, раздел удаляется.
      </p>

      {rows.length === 0 ? (
        <EmptyState icon={Wallet} title="Все обработаны" />
      ) : (
        <Table columns={columns} rows={rows} onRowClick={(st) => navigate(`/students/${st.id}`)} />
      )}

      <ManualChargeModal open={Boolean(chargeTarget)} student={chargeTarget} onClose={() => setChargeTarget(null)} />
    </div>
  );
}
