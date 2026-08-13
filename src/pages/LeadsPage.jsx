// src/pages/LeadsPage.jsx
import { useEffect, useMemo, useReducer, useState } from 'react';
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
import { TrialFormModal } from '../components/leads/TrialFormModal.jsx';
import { LeadColumn } from '../components/leads/LeadColumn.jsx';
import { COLUMNS, columnKeyOf, isForwardAllowed } from '../components/leads/columns.js';
import { advanceStage } from '../lib/leadFunnel.js';

const WON_LOST_VISIBLE_DAYS = 30;
const TERMINAL_STAGES = ['won', 'lost'];

/**
 * Заявки — 7-стадийная воронка продаж (2026-08-13-leads-funnel-redesign.md).
 * Перенос между стадиями — только вперёд (drag-n-drop или кнопка «→»),
 * кроме «Отказ» — туда можно с любой нетерминальной стадии. Клик по
 * карточке — на `/students/:id`.
 */
export function LeadsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const { user, staff } = useAuth();

  // Форс-перерисовка раз в минуту — иначе просроченный SLA-бейдж не
  // появится сам по себе (Firestore не «уведомляет» о течении времени).
  const [, forceTick] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const id = setInterval(forceTick, 60_000);
    return () => clearInterval(id);
  }, []);

  const leadsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'students'),
            where('branchId', '==', activeBranchId),
            where('funnelStage', 'in', COLUMNS.map((c) => c.key)),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId],
  );
  const { data: allLeads } = useCollection(leadsQuery);

  // won/lost старше 30 дней не показываем на доске — иначе терминальные
  // колонки бесконечно растут за месяцы работы (см. план, «Важное
  // архитектурное решение»). Документ никуда не девается, просто не
  // рендерится в этом списке.
  const leads = useMemo(() => {
    const cutoff = Date.now() - WON_LOST_VISIBLE_DAYS * 86_400_000;
    return allLeads.filter((l) => {
      if (!TERMINAL_STAGES.includes(columnKeyOf(l))) return true;
      const at = (l.paidAt ?? l.lostAt ?? l.updatedAt)?.toDate?.();
      return at ? at.getTime() >= cutoff : true;
    });
  }, [allLeads]);

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
  const [declineTarget, setDeclineTarget] = useState(null);
  const [callTarget, setCallTarget] = useState(null);
  const [trialTarget, setTrialTarget] = useState(null); // { lead, mode: 'schedule'|'reschedule' }

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
    const nextAttempts = [...attempts, { result, at: new Date() }];
    const isCold = nextAttempts.length === 5 && nextAttempts.every((a) => a.result === 'fail');
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
      const stageFields = {};
      if (columnKeyOf(lead) === 'new') {
        stageFields.funnelStage = 'calling';
        stageFields.stageHistory = [...(lead.stageHistory ?? []), { stage: 'calling', enteredAt: new Date() }];
      } else if (isCold) {
        stageFields.funnelStage = 'lost';
        stageFields.lostReason = 'no_answer';
        stageFields.lostAt = serverTimestamp();
        stageFields.stageHistory = [...(lead.stageHistory ?? []), { stage: 'lost', enteredAt: new Date() }];
      }
      // serverTimestamp() внутри элемента массива не поддерживается Firestore —
      // callAttempts.at/stageHistory.enteredAt используют клиентское время,
      // updatedAt/lostAt документа ниже — уже верхнеуровневые поля, им можно.
      batch.update(doc(db, 'students', lead.id), {
        callAttempts: nextAttempts,
        ...stageFields,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      if (stageFields.funnelStage === 'lost') showToast(`${lead.fullName}: 5 неудачных попыток, лид отмечен как отказ.`);
    } catch {
      showToast('Не удалось отметить попытку.', { type: 'error' });
    }
  };

  const moveLead = (lead, stageKey) => {
    if (columnKeyOf(lead) === stageKey) return;
    if (!isForwardAllowed(columnKeyOf(lead), stageKey)) {
      showToast('Нельзя вернуть лида на предыдущую стадию.', { type: 'error' });
      return;
    }
    if (stageKey === 'won' || stageKey === 'lost') return; // эти переходы — через оплату/DeclineLeadModal, не через drag
    advanceStage(db, lead, stageKey, {}, user).catch(() => showToast('Не удалось обновить лид.', { type: 'error' }));
  };

  const markTouch = (lead) => {
    const nextNumber = (lead.closingTouchNumber ?? 0) + 1;
    const daysToAdd = nextNumber === 1 ? 1 : 4;
    const nextTouchAt = nextNumber >= 3 ? null : new Date(Date.now() + daysToAdd * 86_400_000);
    patch(lead, { closingTouchNumber: nextNumber, nextTouchAt }, `Касание ${nextNumber} отмечено.`);
  };

  const openAddForm = () => setFormLead({});

  const handleCreated = () => {
    // новый лид уже создан с funnelStage:'new' в StudentFormModal — писать
    // здесь больше нечего, доска подхватит его через onSnapshot.
  };

  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onCall: (lead) => setCallTarget(lead),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onScheduleTrial: (lead) => setTrialTarget({ lead, mode: 'schedule' }),
    onRescheduleTrial: (lead) => setTrialTarget({ lead, mode: 'reschedule' }),
    onMarkAttended: (lead, engagementScore) => {
      // Проходим через 'trial_completed' в 'closing' одним обновлением —
      // без оплаты в момент отметки явки лид сразу уходит в дожим (спека
      // §6), но обе стадии остаются в stageHistory для отчёта по воронке.
      const stageHistory = [
        ...(lead.stageHistory ?? []),
        { stage: 'trial_completed', enteredAt: new Date() },
        { stage: 'closing', enteredAt: new Date() },
      ];
      updateDoc(doc(db, 'students', lead.id), {
        funnelStage: 'closing',
        attended: true,
        engagementScore,
        closingTouchNumber: 0,
        stageHistory,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }).catch(() => showToast('Не удалось сохранить явку.', { type: 'error' }));
    },
    onMarkTouch: markTouch,
    onMove: moveLead,
    onMarkAttempt: markAttempt,
  };

  return (
    <>
      <PageHeader
        title="Заявки"
        actions={
          <Button onClick={openAddForm}>
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
            onAdd={column.key === 'new' ? openAddForm : undefined}
            onDropLead={(leadId, columnKey) => {
              const lead = leadsById.get(leadId);
              if (lead) moveLead(lead, columnKey);
            }}
            {...cardActions}
          />
        ))}
      </div>

      <StudentFormModal student={formLead} onClose={() => setFormLead(null)} onCreated={handleCreated} />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} />
      <CallLogModal open={Boolean(callTarget)} studentId={callTarget?.id} onClose={() => setCallTarget(null)} />
      <TrialFormModal target={trialTarget} onClose={() => setTrialTarget(null)} />
    </>
  );
}
