// src/pages/LeadsPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Button } from '../components/ui/Button.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { CallLogModal } from '../components/students/CallLogModal.jsx';
import { LeadColumn } from '../components/leads/LeadColumn.jsx';
import { COLUMNS, STAGE_KEYS, columnKeyOf } from '../components/leads/columns.js';

/**
 * Заявки — лиды и пробные (`students` с `status` in [lead, trial]), единая
 * kanban-доска в 6 колонок (2026-08-12-leads-kanban-design.md). Перенос
 * между колонками — drag-n-drop или кнопка «→» на карточке (LeadCard).
 * Клик по карточке — на `/students/:id` (там комментарии/история/звонки).
 */
export function LeadsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const { user, staff } = useAuth();

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
  const { data: leads } = useCollection(leadsQuery);

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);

  const operatorByUid = useMemo(() => {
    const map = new Map();
    for (const s of staffList) map.set(s.id, { color: s.color, name: s.fullName });
    return map;
  }, [staffList]);

  const [formLead, setFormLead] = useState(null);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [declineTarget, setDeclineTarget] = useState(null);
  const [callTarget, setCallTarget] = useState(null);

  const byColumn = useMemo(() => {
    const map = {};
    for (const c of COLUMNS) map[c.key] = [];
    for (const lead of leads) map[columnKeyOf(lead)].push(lead);
    return map;
  }, [leads]);

  const leadsById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads]);

  const patch = async (lead, data, okMessage) => {
    try {
      await updateDoc(doc(db, 'students', lead.id), { ...data, updatedAt: serverTimestamp() });
      if (okMessage) showToast(okMessage);
    } catch {
      showToast('Не удалось обновить лид.', { type: 'error' });
    }
  };

  const markAttempt = async (lead, result) => {
    const attempts = lead.callAttempts ?? [];
    if (attempts.length >= 5) return;
    try {
      const batch = writeBatch(db);
      batch.set(doc(collection(db, 'callLogs')), {
        studentId: lead.id,
        direction: 'out',
        result: result === 'success' ? 'reached' : 'no_answer',
        comment: '',
        durationSec: 0,
        quickMark: true,
        userId: user.uid,
        userName: staff?.fullName ?? '',
        createdAt: serverTimestamp(),
      });
      // serverTimestamp() внутри элемента массива не поддерживается Firestore —
      // для callAttempts используем клиентское время, updatedAt документа ниже уже серверное.
      batch.update(doc(db, 'students', lead.id), {
        callAttempts: [...attempts, { result, at: new Date() }],
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch {
      showToast('Не удалось отметить попытку.', { type: 'error' });
    }
  };

  const moveLead = (lead, columnKey) => {
    if (columnKeyOf(lead) === columnKey) return;
    if (STAGE_KEYS.includes(columnKey)) {
      patch(lead, { leadStage: columnKey, leadResult: null });
    } else {
      patch(lead, { leadResult: columnKey });
    }
  };

  const openAddForm = (columnKey) => {
    setPendingTarget({ columnKey });
    setFormLead({});
  };

  const handleCreated = async (id) => {
    if (!pendingTarget) return;
    const { columnKey } = pendingTarget;
    setPendingTarget(null);
    if (columnKey === 'today') return; // дефолт нового лида уже 'today' — писать нечего
    const data = STAGE_KEYS.includes(columnKey) ? { leadStage: columnKey } : { leadResult: columnKey };
    try {
      await updateDoc(doc(db, 'students', id), { ...data, updatedAt: serverTimestamp() });
    } catch {
      showToast('Не удалось определить лида в раздел.', { type: 'error' });
    }
  };

  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onCall: (lead) => setCallTarget(lead),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onMarkTrial: (lead) => patch(lead, { status: 'trial', trialAt: serverTimestamp() }, `${lead.fullName} записан(а) на пробный.`),
    onMove: moveLead,
    onMarkAttempt: markAttempt,
  };

  return (
    <>
      <PageHeader
        title="Заявки"
        actions={
          <Button onClick={() => setFormLead({})}>
            <Plus className="h-4 w-4" /> Добавить лида
          </Button>
        }
      />
      <div className="flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((column) => (
          <LeadColumn
            key={column.key}
            column={column}
            leads={byColumn[column.key]}
            operatorByUid={operatorByUid}
            onAdd={() => openAddForm(column.key)}
            onDropLead={(leadId, columnKey) => {
              const lead = leadsById.get(leadId);
              if (lead) moveLead(lead, columnKey);
            }}
            {...cardActions}
          />
        ))}
      </div>

      <StudentFormModal
        student={formLead}
        onClose={() => {
          setFormLead(null);
          setPendingTarget(null);
        }}
        onCreated={handleCreated}
      />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} />
      <CallLogModal open={Boolean(callTarget)} studentId={callTarget?.id} onClose={() => setCallTarget(null)} />
    </>
  );
}
