import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, Phone, UserCheck, LogIn, X, UserPlus } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Table } from '../components/ui/Table.jsx';
import { Badge } from '../components/ui/Badge.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { SkeletonRow } from '../components/ui/Skeleton.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { CallLogModal } from '../components/students/CallLogModal.jsx';
import { formatPhone, formatDate } from '../lib/format.js';

const STATUS_BADGE = {
  lead: { variant: 'type-system', label: 'Лид' },
  trial: { variant: 'status-active', label: 'Пробный' },
};

export function LeadsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('status', 'in', ['lead', 'trial']),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId],
  );
  const { data: leads, loading, error } = useCollection(leadsQuery);

  const [modalStudent, setModalStudent] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [callTarget, setCallTarget] = useState(null);

  const markTrial = async (lead) => {
    try {
      await updateDoc(doc(db, 'students', lead.id), { status: 'trial', trialAt: serverTimestamp() });
      showToast(`${lead.fullName} записан(а) на пробный.`);
    } catch {
      showToast('Не удалось обновить статус.', { type: 'error' });
    }
  };

  const convert = (lead) => {
    showToast('Добавьте студента в группу, чтобы активировать.');
    navigate(`/students/${lead.id}`);
  };

  const columns = [
    { key: 'fullName', label: 'Имя', render: (l) => l.fullName },
    {
      key: 'phone',
      label: 'Телефон',
      render: (l) => (
        <a href={`tel:+${l.phone}`} onClick={(e) => e.stopPropagation()} className="text-link">
          {formatPhone(l.phone)}
        </a>
      ),
    },
    { key: 'source', label: 'Источник', render: (l) => l.source ?? '—' },
    {
      key: 'status',
      label: 'Статус',
      render: (l) => <Badge variant={STATUS_BADGE[l.status].variant}>{STATUS_BADGE[l.status].label}</Badge>,
    },
    { key: 'createdAt', label: 'Дата добавления', render: (l) => formatDate(l.createdAt) },
    { key: 'nextContact', label: 'Следующий контакт', render: () => '—' },
    {
      key: 'actions',
      label: '',
      render: (l) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="icon-round" tone="navy" onClick={() => setCallTarget(l)} aria-label="Позвонить">
            <Phone className="h-4 w-4" />
          </Button>
          {l.status === 'lead' && (
            <Button variant="icon-round" tone="navy" onClick={() => markTrial(l)} aria-label="На пробный">
              <LogIn className="h-4 w-4" />
            </Button>
          )}
          <Button variant="icon-round" tone="navy" onClick={() => convert(l)} aria-label="Конвертировать">
            <UserCheck className="h-4 w-4" />
          </Button>
          <Button variant="icon-round" tone="danger" onClick={() => setDeclineTarget(l)} aria-label="Отказ">
            <X className="h-4 w-4" />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Заявки"
        count={leads.length}
        actions={
          <Button onClick={() => setModalStudent({})}>
            <Plus className="h-4 w-4" /> Добавить
          </Button>
        }
      />

      {loading && (
        <div className="flex flex-col gap-2">
          <SkeletonRow columns={6} />
          <SkeletonRow columns={6} />
        </div>
      )}

      {error && <p className="text-[15px] text-danger">Не удалось загрузить. Проверьте соединение.</p>}

      {!loading && !error && leads.length === 0 && (
        <EmptyState icon={UserPlus} title="Пока нет ни одного лида" actionLabel="Добавить лида" onAction={() => setModalStudent({})} />
      )}

      {!loading && !error && leads.length > 0 && (
        <Table columns={columns} rows={leads} onRowClick={(l) => navigate(`/students/${l.id}`)} />
      )}

      <StudentFormModal student={modalStudent} onClose={() => setModalStudent(null)} />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} />
      <CallLogModal open={Boolean(callTarget)} studentId={callTarget?.id} onClose={() => setCallTarget(null)} />
    </>
  );
}
