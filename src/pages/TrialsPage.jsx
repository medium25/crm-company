// src/pages/TrialsPage.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, query, where } from 'firebase/firestore';
import { ChevronDown, ChevronRight, Search, Plus } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { TrialLeadCard } from '../components/leads/TrialLeadCard.jsx';
import { TrialCompletedCard } from '../components/leads/TrialCompletedCard.jsx';
import { groupLeadsByTrialDay } from '../components/leads/LeadColumn.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { TrialFormModal } from '../components/leads/TrialFormModal.jsx';
import { DeadlineModal } from '../components/leads/DeadlineModal.jsx';
import { AddToGroupModal } from '../components/students/AddToGroupModal.jsx';
import { AddPaymentModal } from '../components/students/AddPaymentModal.jsx';
import { advanceStage, firstTouchDueAt } from '../lib/leadFunnel.js';
import { archiveStudent } from '../lib/students.js';
import { formatPhone } from '../lib/format.js';

/** Свёрнутая/развёрнутая секция карточек — та же идея, что LeadGroup на «Заявки». */
function TrialGroup({ title, leads, operatorByUid, renderCard }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-field border border-border bg-surface-alt">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-text">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-muted" />}
          {title}
        </span>
        <span className="text-[12px] font-bold text-muted">{leads.length}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-2 border-t border-border p-3 sm:grid-cols-2">
          {leads.length === 0 ? (
            <p className="col-span-full py-2 text-center text-[13px] text-muted">Пусто</p>
          ) : (
            leads.map((lead) => {
              const op = operatorByUid.get(lead.assignedOperator);
              return <div key={lead.id}>{renderCard(lead, op)}</div>;
            })
          )}
        </div>
      )}
    </div>
  );
}

/** Поиск лида по всей базе (не только среди «Пробный назначен») — для ручной записи на пробный. */
function LeadSearch({ onPick, onManualAdd }) {
  const { activeBranchId } = useBranch();
  const [active, setActive] = useState(false);
  const [q, setQ] = useState('');

  const searchQuery = useMemo(
    () => (db && activeBranchId && active ? query(collection(db, 'students'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId, active],
  );
  const { data: allLeads } = useCollection(searchQuery);

  const term = q.trim().toLowerCase();
  const results = term ? allLeads.filter((s) => s.fullName?.toLowerCase().includes(term) || s.phone?.includes(term)).slice(0, 8) : [];

  return (
    <div className="relative mb-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onFocus={() => setActive(true)}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти лида по всей базе — записать на пробный вручную"
            className="h-10 w-full rounded-field border border-border-strong bg-white pl-9 pr-3 text-[14px] text-text focus:border-navy focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onManualAdd}
          aria-label="Новый лид с пробным (пришёл не от операторов)"
          title="Новый лид с пробным (пришёл не от операторов)"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field border border-border-strong text-muted hover:bg-surface-alt hover:text-text"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {active && term && (
        <div className="absolute inset-x-0 top-11 z-20 max-h-72 overflow-y-auto rounded-field border border-border bg-surface py-1 shadow-hover">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-muted">Ничего не найдено</p>
          ) : (
            results.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => {
                  onPick(lead);
                  setQ('');
                  setActive(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[14px] hover:bg-surface-alt"
              >
                <span className="text-text">{lead.fullName}</span>
                <span className="text-muted">{formatPhone(lead.phone)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Пробные» — 2 колонки: «Пробный назначен» (все операторы, поиск по всей
 * базе + ручная запись на пробный в обход операторов) и «Пробный проведён»
 * (студент уже создан, ждёт оплаты — оплата/перенос/архивация прямо с
 * карточки).
 */
export function TrialsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('funnelStage', 'in', ['trial_scheduled', 'trial_completed']),
          )
        : null,
    [activeBranchId],
  );
  const { data: rawLeads } = useCollection(leadsQuery);

  const sorted = useMemo(
    () => [...rawLeads].sort((a, b) => (a.trialDate?.toMillis?.() ?? 0) - (b.trialDate?.toMillis?.() ?? 0)),
    [rawLeads],
  );
  const scheduledLeads = useMemo(() => sorted.filter((l) => l.funnelStage === 'trial_scheduled'), [sorted]);
  const completedLeads = useMemo(() => sorted.filter((l) => l.funnelStage === 'trial_completed'), [sorted]);

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

  const [createStudentTarget, setCreateStudentTarget] = useState(null);
  const [manualLeadTarget, setManualLeadTarget] = useState(null); // {} — StudentFormModal открыт
  const [trialTarget, setTrialTarget] = useState(null); // { lead, mode: 'schedule' } — TrialFormModal
  const [deferTarget, setDeferTarget] = useState(null); // DeadlineModal
  const [paymentTarget, setPaymentTarget] = useState(null); // AddPaymentModal
  const [archiveTarget, setArchiveTarget] = useState(null); // ConfirmDialog
  const [archiving, setArchiving] = useState(false);

  const enrollmentsQuery = useMemo(
    () => (db && paymentTarget ? query(collection(db, 'enrollments'), where('studentId', '==', paymentTarget.id), where('isArchived', '==', false)) : null),
    [paymentTarget],
  );
  const { data: paymentEnrollments } = useCollection(enrollmentsQuery);

  // Учитель/группа для карточек «Пробный проведён» — TrialFormModal их не
  // спрашивает (см. docstring там), они появляются только вместе с
  // enrollment, который создаёт AddToGroupModal («Создать студента»).
  const branchEnrollmentsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'enrollments'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: allEnrollments } = useCollection(branchEnrollmentsQuery);
  const enrollmentByStudent = useMemo(() => {
    const map = new Map();
    for (const e of allEnrollments) if (!map.has(e.studentId)) map.set(e.studentId, e);
    return map;
  }, [allEnrollments]);

  const groups = useMemo(() => groupLeadsByTrialDay(scheduledLeads), [scheduledLeads]);
  const onOpen = (lead) => navigate(`/students/${lead.id}`);

  const handleManualCreated = async (id) => {
    const snap = await getDoc(doc(db, 'students', id));
    if (snap.exists()) setTrialTarget({ lead: { id: snap.id, ...snap.data() }, mode: 'schedule' });
  };

  const confirmDeferPayment = (lead) => {
    setDeferTarget({
      lead,
      title: 'Дедлайн первого касания в «Дожиме»',
      suggestedDate: firstTouchDueAt(lead.trialDate?.toDate?.()),
      lockDate: true,
      onConfirm: (dueDate) =>
        advanceStage(db, lead, 'closing', { closingTouchNumber: 0, nextTouchAt: dueDate, unreachableAttempts: [] }, user).catch(() =>
          showToast('Не удалось перенести оплату.', { type: 'error' }),
        ),
    });
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await archiveStudent(db, archiveTarget, user);
      showToast(`${archiveTarget.fullName}: перенесён в архив.`);
    } catch {
      showToast('Не удалось архивировать студента.', { type: 'error' });
    } finally {
      setArchiving(false);
      setArchiveTarget(null);
    }
  };

  return (
    <div>
      <PageHeader title="Пробные" count={scheduledLeads.length + completedLeads.length} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold uppercase tracking-wide text-text">Пробный назначен ({scheduledLeads.length})</h2>
          <LeadSearch
            onPick={(lead) => setTrialTarget({ lead, mode: 'schedule' })}
            onManualAdd={() => setManualLeadTarget({})}
          />
          <TrialGroup
            title="Сегодня"
            leads={groups.today}
            operatorByUid={operatorByUid}
            renderCard={(lead, op) => (
              <TrialLeadCard lead={lead} operatorColor={op?.color} operatorName={op?.name} onOpen={onOpen} onCreateStudent={setCreateStudentTarget} />
            )}
          />
          <TrialGroup
            title="Завтра"
            leads={groups.tomorrow}
            operatorByUid={operatorByUid}
            renderCard={(lead, op) => (
              <TrialLeadCard lead={lead} operatorColor={op?.color} operatorName={op?.name} onOpen={onOpen} onCreateStudent={setCreateStudentTarget} />
            )}
          />
          <TrialGroup
            title="Другой день"
            leads={groups.other}
            operatorByUid={operatorByUid}
            renderCard={(lead, op) => (
              <TrialLeadCard lead={lead} operatorColor={op?.color} operatorName={op?.name} onOpen={onOpen} onCreateStudent={setCreateStudentTarget} />
            )}
          />
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-[15px] font-bold uppercase tracking-wide text-text">Пробный проведён ({completedLeads.length})</h2>
          <div className="rounded-field border border-border bg-surface-alt">
            <div className="flex flex-col gap-2 p-3">
              {completedLeads.length === 0 ? (
                <p className="py-4 text-center text-[13px] text-muted">Пусто</p>
              ) : (
                completedLeads.map((lead) => {
                  const op = operatorByUid.get(lead.assignedOperator);
                  const enrollment = enrollmentByStudent.get(lead.id);
                  return (
                    <TrialCompletedCard
                      key={lead.id}
                      lead={lead}
                      operatorColor={op?.color}
                      operatorName={op?.name}
                      teacherName={enrollment?.teacherName}
                      groupCode={enrollment?.groupCode}
                      onOpen={onOpen}
                      onPay={setPaymentTarget}
                      onDeferPayment={confirmDeferPayment}
                      onArchive={setArchiveTarget}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <AddToGroupModal open={Boolean(createStudentTarget)} student={createStudentTarget} onClose={() => setCreateStudentTarget(null)} />
      <StudentFormModal student={manualLeadTarget} onClose={() => setManualLeadTarget(null)} onCreated={handleManualCreated} />
      <TrialFormModal target={trialTarget} onClose={() => setTrialTarget(null)} />
      <DeadlineModal target={deferTarget} onClose={() => setDeferTarget(null)} />
      <AddPaymentModal open={Boolean(paymentTarget)} student={paymentTarget} enrollments={paymentEnrollments} onClose={() => setPaymentTarget(null)} />
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        onClose={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        loading={archiving}
        title="Архивировать студента"
        message={archiveTarget ? `Перенести «${archiveTarget.fullName}» в архив? Заявка закроется в «Отказ», история останется доступна.` : ''}
        confirmLabel="В архив"
      />
    </div>
  );
}
