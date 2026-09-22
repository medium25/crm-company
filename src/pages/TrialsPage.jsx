// src/pages/TrialsPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, query, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth } from '../hooks/useAuth.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useDoc } from '../hooks/useDoc.js';
import { useToast } from '../components/ui/Toast.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { LeadCard } from '../components/leads/LeadCard.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { ResetLeadModal } from '../components/leads/ResetLeadModal.jsx';
import { GroupBookingModal } from '../components/leads/GroupBookingModal.jsx';
import { TrialCompletedCard } from '../components/leads/TrialCompletedCard.jsx';
import { groupLeadsByTrialDay } from '../components/leads/LeadColumn.jsx';
import { COLUMNS, withStageOverrides } from '../components/leads/columns.js';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeleteLeadModal } from '../components/students/DeleteLeadModal.jsx';
import { TrialFormModal } from '../components/leads/TrialFormModal.jsx';
import { DeadlineModal } from '../components/leads/DeadlineModal.jsx';
import { AddToGroupModal } from '../components/students/AddToGroupModal.jsx';
import { AddPaymentModal } from '../components/students/AddPaymentModal.jsx';
import { advanceStage, firstTouchDueAt } from '../lib/leadFunnel.js';
import { markTrialUnreachable } from '../lib/trialContact.js';
import { archiveStudent } from '../lib/students.js';
import { formatPhone } from '../lib/format.js';
import { locateLead } from '../lib/leadLocation.js';
import { setSearchSource, clearSearchSource } from '../lib/searchSource.js';

const TRIAL_SCHEDULED_COLOR = COLUMNS.find((c) => c.key === 'trial_scheduled').color;
const TRIAL_COMPLETED_COLOR = COLUMNS.find((c) => c.key === 'trial_completed').color;

/** Заголовок колонки — та же цветная линия-разделитель, что у колонок «Заявки» (LeadColumn). */
function TrialColumnHeader({ label, count, color }) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 border-b-2 px-1 pb-2.5" style={{ borderBottomColor: color }}>
      <span />
      <span className="justify-self-center text-[15px] font-bold uppercase tracking-wide text-text">{label}</span>
      <span className="justify-self-end text-[13px] font-bold text-muted">{count}</span>
    </div>
  );
}

/** Свёрнутая/развёрнутая секция карточек — та же идея, что LeadGroup на «Заявки». */
function TrialGroup({ title, leads, operatorByUid, renderCard, highlightId, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  // Найденная поиском карточка лежит в свёрнутой секции — раскрываем её.
  const holdsHighlight = Boolean(highlightId) && leads.some((l) => l.id === highlightId);
  useEffect(() => {
    if (holdsHighlight) setOpen(true);
  }, [holdsHighlight]);

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
              return (
                <div key={lead.id} id={`trial-card-${lead.id}`} className={highlightId === lead.id ? 'rounded-xl ring-4 ring-navy ring-offset-2' : ''}>
                  {renderCard(lead, op)}
                </div>
              );
            })
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
  const { user, staff } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('isArchived', '==', false),
            where('funnelStage', 'in', ['trial_scheduled', 'trial_completed', 'closing']),
          )
        : null,
    [activeBranchId],
  );
  const { data: rawLeads } = useCollection(leadsQuery);

  // Поиск в шапке ищет по этим же уже загруженным пробным (без своей подписки).
  useEffect(() => {
    setSearchSource('trials', { items: rawLeads });
  }, [rawLeads]);
  useEffect(() => () => clearSearchSource('trials'), []);

  const sorted = useMemo(
    () => [...rawLeads].sort((a, b) => (a.trialDate?.toMillis?.() ?? 0) - (b.trialDate?.toMillis?.() ?? 0)),
    [rawLeads],
  );
  const scheduledLeads = useMemo(() => sorted.filter((l) => l.funnelStage === 'trial_scheduled'), [sorted]);
  // Колонка «Пробные» — все лиды всех операторов, уже прошедшие пробный: «Пробный проведён» и «Дожим».
  const completedLeadsAll = useMemo(() => sorted.filter((l) => l.funnelStage === 'trial_completed' || l.funnelStage === 'closing'), [sorted]);

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
  const [editTarget, setEditTarget] = useState(null); // StudentFormModal в режиме редактирования
  const [deleteTarget, setDeleteTarget] = useState(null); // DeleteLeadModal
  const [manualCompletedTarget, setManualCompletedTarget] = useState(null); // {} — StudentFormModal (createMode="trial_completed")
  const [trialTarget, setTrialTarget] = useState(null); // { lead, mode: 'schedule' } — TrialFormModal
  const [deferTarget, setDeferTarget] = useState(null); // DeadlineModal
  const [declineTarget, setDeclineTarget] = useState(null); // DeclineLeadModal
  const [resetTarget, setResetTarget] = useState(null); // ResetLeadModal
  const [bookingTarget, setBookingTarget] = useState(null); // GroupBookingModal
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

  // Чётность/нечётность «Пробных» — по расписанию группы, куда уже
  // записан студент (enrollment.groupId), а не по дню недели пробного.
  // Нечётная — только если у группы явно schedule.type==='odd'; всё
  // остальное (чётная, «по дням недели», группы ещё нет) — в чётные,
  // операторы сами перенесут после того как группа станет известна.
  const branchGroupsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('isArchived', '==', false)) : null),
    [activeBranchId],
  );
  const { data: branchGroups } = useCollection(branchGroupsQuery);
  const scheduleTypeByGroupId = useMemo(() => {
    const map = new Map();
    for (const g of branchGroups) map.set(g.id, g.schedule?.type);
    return map;
  }, [branchGroups]);
  const completedLeadsByParity = useMemo(() => {
    const buckets = { even: [], odd: [] };
    for (const lead of completedLeadsAll) {
      const groupId = enrollmentByStudent.get(lead.id)?.groupId;
      const scheduleType = groupId ? scheduleTypeByGroupId.get(groupId) : null;
      buckets[scheduleType === 'odd' ? 'odd' : 'even'].push(lead);
    }
    return buckets;
  }, [completedLeadsAll, enrollmentByStudent, scheduleTypeByGroupId]);
  // Пн/Ср/Пт — нечётные дни группы (см. ODD_WEEKDAYS в lib/schedule.js),
  // остальные (включая вс) — чётные. Открываем по умолчанию ту вкладку,
  // что актуальна сегодня.
  const isOddDayToday = [1, 3, 5].includes(new Date().getDay());

  const groups = useMemo(() => groupLeadsByTrialDay(scheduledLeads), [scheduledLeads]);

  // Выбор лида в поиске «по всей базе» — только находим его карточку и выделяем рамкой:
  // на этой странице, если лид среди пробных, иначе ведём на его место (доска «Заявки»
  // или страница ученика). Окно записи на пробный само не открывается.
  const [highlightId, setHighlightId] = useState(null);
  const focusLead = (lead, where) => {
    if (rawLeads.some((l) => l.id === lead.id)) setHighlightId(lead.id);
    else navigate(where.path);
  };
  useEffect(() => {
    if (!highlightId) return undefined;
    let tries = 0;
    const poll = setInterval(() => {
      tries += 1;
      const el = document.getElementById(`trial-card-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(poll);
      } else if (tries > 20) {
        clearInterval(poll);
      }
    }, 150);
    const clear = setTimeout(() => setHighlightId(null), 3500);
    return () => {
      clearInterval(poll);
      clearTimeout(clear);
    };
  }, [highlightId]);
  const onOpen = (lead) => navigate(`/students/${lead.id}`);

  // Названия/цвета стадий и макс. касаний — из настроек филиала (⚙ на доске «Заявки»),
  // чтобы «Касание N/M» здесь считалось так же, как на доске.
  const branchSettingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: branchSettings } = useDoc(branchSettingsRef);
  const resolvedColumns = useMemo(() => withStageOverrides(branchSettings?.leadStageOverrides), [branchSettings]);
  const trialMaxTouches = resolvedColumns.find((c) => c.key === 'trial_scheduled')?.maxTouches ?? 3;
  const callMaxAttempts = resolvedColumns.find((c) => c.key === 'calling')?.maxTouches ?? 5;
  const closingStage = resolvedColumns.find((c) => c.key === 'closing');

  const patchLead = async (lead, data) => {
    try {
      await updateDoc(doc(db, 'students', lead.id), { ...data, updatedAt: serverTimestamp() });
    } catch {
      showToast('Не удалось обновить лид.', { type: 'error' });
    }
  };

  // Колонка «Записи» — та же карточка LeadCard, что на доске «Заявки» на стадии «Пробный
  // назначен», с теми же действиями. Касание: галочка → «Создать студента» / «Перенести
  // пробное» (1 раз), крестик — неуспешное касание.
  const renderScheduledCard = (lead, op) => (
    <LeadCard
      lead={lead}
      operatorColor={op?.color}
      operatorName={op?.name}
      columns={resolvedColumns}
      onOpen={onOpen}
      onEdit={setEditTarget}
      onDecline={setDeclineTarget}
      onDelete={setDeleteTarget}
      onResetToNew={setResetTarget}
      onScheduleTrial={(l) => setTrialTarget({ lead: l, mode: 'schedule' })}
      onRescheduleTrial={(l) => setTrialTarget({ lead: l, mode: 'reschedule' })}
      onCreateStudent={setCreateStudentTarget}
      onOpenBooking={setBookingTarget}
      onMove={(l, stageKey) => {
        if (stageKey === 'lost') setDeclineTarget(l);
        else advanceStage(db, l, stageKey, {}, user).catch(() => showToast('Не удалось обновить лид.', { type: 'error' }));
      }}
      onMarkUnreachable={(l, result, onRescheduleCb) =>
        markTrialUnreachable({ lead: l, result, onRescheduleCb, user, patch: patchLead, setDeadlineTarget: setDeferTarget, maxAttempts: trialMaxTouches })
      }
      onMarkTouch={() => {}}
      onMarkAttempt={() => {}}
      onToggleCallReminder={() => {}}
      onDismissFromBoard={() => {}}
    />
  );

  const handleManualCreated = async (id) => {
    const snap = await getDoc(doc(db, 'students', id));
    if (snap.exists()) setTrialTarget({ lead: { id: snap.id, ...snap.data() }, mode: 'schedule' });
  };

  const confirmDeferPayment = (lead) => {
    setDeferTarget({
      lead,
      title: `Дедлайн первого касания: ${closingStage?.label ?? 'Дожим'}`,
      suggestedDate: firstTouchDueAt(lead.trialDate?.toDate?.()),
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <TrialColumnHeader label="Записи" count={scheduledLeads.length} color={TRIAL_SCHEDULED_COLOR} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setManualLeadTarget({})}
              aria-label="Новый лид с пробным (пришёл не от операторов)"
              title="Новый лид с пробным (пришёл не от операторов)"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field border border-border-strong bg-white text-text transition hover:bg-surface-alt"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
          {groups.overdue.length > 0 && (
            <TrialGroup
              title="Просроченные"
              leads={groups.overdue}
              operatorByUid={operatorByUid}
              highlightId={highlightId}
              defaultOpen
              renderCard={renderScheduledCard}
            />
          )}
          <TrialGroup
            title="Сегодня"
            leads={groups.today}
            operatorByUid={operatorByUid}
            highlightId={highlightId}
            defaultOpen
            renderCard={renderScheduledCard}
          />
          <TrialGroup
            title="Завтра"
            leads={groups.tomorrow}
            operatorByUid={operatorByUid}
            highlightId={highlightId}
            renderCard={renderScheduledCard}
          />
          <TrialGroup
            title="Другой день"
            leads={groups.other}
            operatorByUid={operatorByUid}
            highlightId={highlightId}
            renderCard={renderScheduledCard}
          />
        </div>

        <div className="flex flex-col gap-3">
          <TrialColumnHeader label="Пробные" count={completedLeadsAll.length} color={TRIAL_COMPLETED_COLOR} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setManualCompletedTarget({})}
              aria-label="Пробный без записи оператором — сразу студентом сюда"
              title="Пробный без записи оператором — сразу студентом сюда"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field border border-border-strong bg-white text-text transition hover:bg-surface-alt"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
          <TrialGroup
            title="Чётные"
            leads={completedLeadsByParity.even}
            operatorByUid={operatorByUid}
            highlightId={highlightId}
            defaultOpen={!isOddDayToday}
            renderCard={(lead, op) => {
              const enrollment = enrollmentByStudent.get(lead.id);
              return (
                <TrialCompletedCard
                  lead={lead}
                  operatorColor={op?.color}
                  operatorName={op?.name}
                  teacherName={enrollment?.teacherName}
                  groupCode={enrollment?.groupCode}
                  closingStage={closingStage}
                  onOpen={onOpen}
                  onPay={setPaymentTarget}
                  onDeferPayment={confirmDeferPayment}
                  onArchive={setArchiveTarget}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                />
              );
            }}
          />
          <TrialGroup
            title="Нечётные"
            leads={completedLeadsByParity.odd}
            operatorByUid={operatorByUid}
            highlightId={highlightId}
            defaultOpen={isOddDayToday}
            renderCard={(lead, op) => {
              const enrollment = enrollmentByStudent.get(lead.id);
              return (
                <TrialCompletedCard
                  lead={lead}
                  operatorColor={op?.color}
                  operatorName={op?.name}
                  teacherName={enrollment?.teacherName}
                  groupCode={enrollment?.groupCode}
                  closingStage={closingStage}
                  onOpen={onOpen}
                  onPay={setPaymentTarget}
                  onDeferPayment={confirmDeferPayment}
                  onArchive={setArchiveTarget}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                />
              );
            }}
          />
        </div>
      </div>

      <AddToGroupModal open={Boolean(createStudentTarget)} student={createStudentTarget} onClose={() => setCreateStudentTarget(null)} />
      <StudentFormModal student={manualLeadTarget} onClose={() => setManualLeadTarget(null)} onCreated={handleManualCreated} />
      <StudentFormModal student={editTarget} onClose={() => setEditTarget(null)} />
      <DeleteLeadModal lead={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <StudentFormModal
        student={manualCompletedTarget}
        onClose={() => setManualCompletedTarget(null)}
        createMode="trial_completed"
      />
      <TrialFormModal target={trialTarget} onClose={() => setTrialTarget(null)} />
      <DeadlineModal target={deferTarget} onClose={() => setDeferTarget(null)} />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} callMaxAttempts={callMaxAttempts} />
      <ResetLeadModal lead={resetTarget} onClose={() => setResetTarget(null)} />
      <GroupBookingModal lead={bookingTarget} allLeads={rawLeads} onClose={() => setBookingTarget(null)} />
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
