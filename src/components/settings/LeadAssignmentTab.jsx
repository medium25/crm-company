import { useEffect, useMemo, useState } from 'react';
import { collection, doc, query, where, orderBy, setDoc, serverTimestamp, getCountFromServer } from 'firebase/firestore';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { Table } from '../ui/Table.jsx';
import { Badge } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { SkeletonRow } from '../ui/Skeleton.jsx';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { OperatorScheduleModal } from './OperatorScheduleModal.jsx';
import { OperatorLeadsPanel } from './OperatorLeadsPanel.jsx';
import { TransferAllLeadsModal } from './TransferAllLeadsModal.jsx';

/**
 * Кто получает новых лидов и с каким приоритетом — настройка вместо
 * жёсткого round-robin. Активные операторы отмечаются здесь; новый лид
 * достаётся тому, у кого сейчас меньше карточек в «Новый лид»+«Дозвон»
 * (см. assignLeastLoadedOperator в lib/leadFunnel.js). Нагрузка в колонке
 * «Сейчас лидов» — просто для наглядности, кто чем занят прямо сейчас.
 */
export function LeadAssignmentTab() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const staffQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'staff'),
            where('branchIds', 'array-contains', activeBranchId),
            where('role', 'in', ['ceo', 'manager', 'admin']),
            orderBy('fullName'),
          )
        : null,
    [activeBranchId],
  );
  const { data: staffList, loading: staffLoading } = useCollection(staffQuery);

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settingsDoc, loading: settingsLoading } = useDoc(settingsRef);
  const activeOperators = settingsDoc?.activeLeadOperators ?? null;

  const [counts, setCounts] = useState({});
  const [countsVersion, setCountsVersion] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [transferAllTarget, setTransferAllTarget] = useState(null);

  // Переключатель филиала в топбаре не размонтирует компонент — сбрасываем
  // всё, что указывает на оператора/лида из СТАРОГО branchId, иначе
  // staffList.find(...) после переключения либо вернёт undefined (крэш в
  // OperatorLeadsPanel), либо молча подсунет оператора чужого филиала в
  // модалки расписания/перевода.
  useEffect(() => {
    setExpandedId(null);
    setScheduleTarget(null);
    setTransferAllTarget(null);
  }, [activeBranchId]);

  useEffect(() => {
    if (!db || !activeBranchId || staffList.length === 0) return;
    let cancelled = false;
    Promise.all(
      staffList.map((m) =>
        getCountFromServer(
          query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('assignedOperator', '==', m.id),
            where('funnelStage', 'in', ['new', 'calling']),
          ),
        ).then((snap) => [m.id, snap.data().count]),
      ),
    ).then((pairs) => {
      if (!cancelled) setCounts(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [staffList, activeBranchId, countsVersion]);

  if (staffLoading || settingsLoading) {
    return (
      <div className="flex flex-col gap-2">
        <SkeletonRow columns={5} />
        <SkeletonRow columns={5} />
      </div>
    );
  }

  if (staffList.length === 0) {
    return <EmptyState icon={Users} title="Пока нет сотрудников с ролью руководителя/менеджера" />;
  }

  // Пока никто не сохранял настройку — по умолчанию активны все (старое
  // поведение round-robin включало весь этот же пул), чтобы включение
  // вкладки не оставило доску без операторов молча.
  const isActive = (id) => (activeOperators === null ? true : activeOperators.includes(id));

  const toggle = async (member) => {
    setSavingId(member.id);
    try {
      const current = activeOperators === null ? staffList.map((m) => m.id) : activeOperators;
      const next = current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id];
      await setDoc(
        settingsRef,
        { activeLeadOperators: next, updatedAt: serverTimestamp(), updatedBy: user.uid },
        { merge: true },
      );
    } catch {
      showToast('Не удалось сохранить.', { type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  const columns = [
    {
      key: 'fullName',
      label: 'Сотрудник',
      render: (m) => <div className="font-bold">{m.fullName}</div>,
    },
    {
      key: '__count',
      label: 'Сейчас лидов (новый + дозвон)',
      render: (m) => <span className="text-[15px] text-muted">{counts[m.id] ?? '—'}</span>,
    },
    {
      key: '__active',
      label: 'Получает новых лидов',
      render: (m) => (
        <button type="button" onClick={() => toggle(m)} disabled={savingId === m.id}>
          <Badge variant={isActive(m.id) ? 'status-active' : 'type-system'}>{isActive(m.id) ? 'Активен' : 'Отключён'}</Badge>
        </button>
      ),
    },
    {
      key: '__expand',
      label: '',
      width: '40px',
      render: (m) => (
        <button
          type="button"
          onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
          aria-label={expandedId === m.id ? 'Свернуть лиды оператора' : 'Показать лиды оператора'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
        >
          {expandedId === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ),
    },
    {
      key: '__actions',
      label: '',
      width: '48px',
      render: (m) => (
        <DropdownMenu
          items={[
            { label: 'Расписание', onClick: () => setScheduleTarget(m) },
            { label: 'Перевести все лиды', onClick: () => setTransferAllTarget(m) },
          ]}
        />
      ),
    },
  ];

  const expandedOperator = staffList.find((m) => m.id === expandedId) ?? null;

  return (
    <div className="max-w-4xl">
      <p className="mb-4 text-[15px] text-muted">
        Новый лид в первую очередь достаётся активному оператору, у которого сейчас рабочее время по расписанию, и
        только среди них — наименее загруженному. Если по расписанию никто не работает — прежняя логика: наименее
        загруженный среди всех активных.
      </p>
      <Table columns={columns} rows={staffList} />
      {expandedOperator && (
        <OperatorLeadsPanel
          operator={expandedOperator}
          operators={staffList.filter((m) => isActive(m.id))}
          stageOverrides={settingsDoc?.leadStageOverrides}
          onClose={() => setExpandedId(null)}
          onTransferred={() => setCountsVersion((v) => v + 1)}
        />
      )}
      <OperatorScheduleModal
        operator={scheduleTarget}
        schedule={settingsDoc?.operatorSchedules?.[scheduleTarget?.id]}
        onClose={() => setScheduleTarget(null)}
      />
      <TransferAllLeadsModal
        operator={transferAllTarget}
        operators={staffList.filter((m) => isActive(m.id))}
        onClose={() => setTransferAllTarget(null)}
        onTransferred={() => setCountsVersion((v) => v + 1)}
      />
    </div>
  );
}
