// src/pages/LeadsPage.jsx
import { useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, where, orderBy, updateDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useDoc } from '../hooks/useDoc.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { DeleteLeadModal } from '../components/students/DeleteLeadModal.jsx';
import { TrialFormModal } from '../components/leads/TrialFormModal.jsx';
import { DeadlineModal } from '../components/leads/DeadlineModal.jsx';
import { LeadColumn } from '../components/leads/LeadColumn.jsx';
import { COLUMNS, columnKeyOf, isForwardAllowed, withStageOverrides } from '../components/leads/columns.js';
import { advanceStage, nextCallDueAt, firstTouchDueAt, unreachableCallDueAt } from '../lib/leadFunnel.js';

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
  // Ceo/manager видят все заявки филиала по умолчанию, с кнопкой
  // переключения на «только мои»; остальные роли (admin/teacher) всегда
  // видят только назначенные лично им — без кнопки, переключать нечего.
  const canSeeAllLeads = staff?.role === 'ceo' || staff?.role === 'manager';
  const [showOnlyMine, setShowOnlyMine] = useState(false);

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
            where('isArchived', '==', false),
            where('funnelStage', 'in', COLUMNS.map((c) => c.key)),
            orderBy('createdAt', 'desc'),
          )
        : null,
    [activeBranchId],
  );
  const { data: allLeads } = useCollection(leadsQuery);

  // Название и цвет стадии редактируются через ⚙ в заголовке колонки и
  // хранятся per-branch, а не в самом COLUMNS — ключ и порядок стадий
  // остаются фиксированными (на них завязаны isForwardAllowed/
  // stageDeadline/markAttempt), правится только то, что видит оператор.
  const branchSettingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: branchSettings } = useDoc(branchSettingsRef);
  const resolvedColumns = useMemo(() => withStageOverrides(branchSettings?.leadStageOverrides), [branchSettings]);

  const editStageColumn = (stageKey, patch) => {
    if (!branchSettingsRef) return;
    // set+merge, не update — settings/{branchId} может ещё не существовать
    // (создаётся лениво при первом сохранении любой из его настроек), а
    // merge на вложенный объект сохраняет overrides остальных стадий как есть.
    setDoc(branchSettingsRef, { leadStageOverrides: { [stageKey]: patch } }, { merge: true }).catch(() =>
      showToast('Не удалось сохранить стадию.', { type: 'error' }),
    );
  };

  // won/lost старше 30 дней не показываем на доске — иначе терминальные
  // колонки бесконечно растут за месяцы работы (см. план, «Важное
  // архитектурное решение»). Документ никуда не девается, просто не
  // рендерится в этом списке.
  const leads = useMemo(() => {
    const cutoff = Date.now() - WON_LOST_VISIBLE_DAYS * 86_400_000;
    const scopedToSelf = !canSeeAllLeads || showOnlyMine;
    return allLeads.filter((l) => {
      if (scopedToSelf && l.assignedOperator !== user.uid) return false;
      if (!TERMINAL_STAGES.includes(columnKeyOf(l))) return true;
      const at = (l.paidAt ?? l.lostAt ?? l.updatedAt)?.toDate?.();
      return at ? at.getTime() >= cutoff : true;
    });
  }, [allLeads, canSeeAllLeads, showOnlyMine, user.uid]);

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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [trialTarget, setTrialTarget] = useState(null); // { lead, mode: 'schedule'|'reschedule' }
  const [deadlineTarget, setDeadlineTarget] = useState(null); // { lead, title, suggestedDate, onConfirm }

  const byColumn = useMemo(() => {
    const map = {};
    for (const c of COLUMNS) map[c.key] = [];
    for (const lead of leads) map[columnKeyOf(lead)].push(lead);
    // «Пробный назначен» — ближайший пробный первым, а не по дате создания
    // лида (порядок остальных колонок), чтобы срочное было видно сразу.
    map.trial_scheduled.sort((a, b) => (a.trialDate?.seconds ?? Infinity) - (b.trialDate?.seconds ?? Infinity));
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

  // Любое действие, что продвигает лида на нетерминальную стадию, обязано
  // назначить дедлайн следующего шага — и оператор обязан его увидеть и
  // подтвердить (или поправить) перед сохранением, а не получить тихий
  // автовычисленный дедлайн в фоне. Отсюда общий паттерн ниже: посчитать
  // предложенную дату, открыть DeadlineModal, а сама запись в Firestore
  // происходит только в её onConfirm.
  const markAttempt = (lead, result) => {
    const attempts = lead.callAttempts ?? [];
    if (attempts.length >= 5) return;
    const nextAttempts = [...attempts, { result, at: new Date() }];
    const isCold = nextAttempts.length === 5 && nextAttempts.every((a) => a.result === 'fail');

    const commit = async (dueDate) => {
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
          nextCallDueAt: isCold ? null : dueDate,
          ...stageFields,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        if (stageFields.funnelStage === 'lost') showToast(`${lead.fullName}: 5 неудачных попыток, лид отмечен как отказ.`);
      } catch {
        showToast('Не удалось отметить попытку.', { type: 'error' });
      }
    };

    if (isCold) {
      commit(null); // терминальная стадия «Отказ» — дедлайну неоткуда взяться, спрашивать нечего
      return;
    }
    setDeadlineTarget({ lead, title: 'Дедлайн следующего звонка', suggestedDate: nextCallDueAt(nextAttempts), onConfirm: commit });
  };

  const moveLead = (lead, stageKey) => {
    if (columnKeyOf(lead) === stageKey) return;
    if (!isForwardAllowed(columnKeyOf(lead), stageKey)) {
      showToast('Нельзя вернуть лида на предыдущую стадию.', { type: 'error' });
      return;
    }
    if (stageKey === 'lost') {
      setDeclineTarget(lead); // нужна причина из фиксированного списка — открываем ту же форму, что и «⋮»
      return;
    }
    if (stageKey === 'trial_scheduled') {
      setTrialTarget({ lead, mode: 'schedule' }); // нужна дата/время/учитель — открываем ту же форму, что и «⋮»
      return;
    }
    const commit = (extraFields) =>
      advanceStage(db, lead, stageKey, extraFields, user).catch(() => showToast('Не удалось обновить лид.', { type: 'error' }));

    if (stageKey === 'calling') {
      setDeadlineTarget({
        lead,
        title: 'Дедлайн следующего звонка',
        suggestedDate: nextCallDueAt(lead.callAttempts ?? []),
        onConfirm: (dueDate) => commit({ nextCallDueAt: dueDate }),
      });
      return;
    }
    if (stageKey === 'closing') {
      setDeadlineTarget({
        lead,
        title: 'Дедлайн первого касания в «Дожиме»',
        suggestedDate: firstTouchDueAt(),
        onConfirm: (dueDate) => commit({ closingTouchNumber: 0, nextTouchAt: dueDate }),
      });
      return;
    }
    // 'trial_completed' — мгновенный проходной этап; 'won' вручную (стрелка/
    // drag) — просто переключает стадию, без записи оплаты (по решению
    // владельца — оплата на странице студента остаётся отдельным, основным
    // путём в «Оплачено», этот путь запасной). Ни там ни там дедлайну
    // взяться неоткуда.
    commit({});
  };

  const markTouch = (lead) => {
    const nextNumber = (lead.closingTouchNumber ?? 0) + 1;
    const daysToAdd = nextNumber === 1 ? 1 : 4;
    const isFinal = nextNumber >= 3;
    const commit = (dueDate) =>
      patch(lead, { closingTouchNumber: nextNumber, nextTouchAt: isFinal ? null : dueDate }, `Касание ${nextNumber} отмечено.`);

    if (isFinal) {
      commit(null); // 3-е касание финальное — дальше дожима нет, дедлайну взяться неоткуда
      return;
    }
    setDeadlineTarget({
      lead,
      title: 'Дедлайн следующего касания',
      suggestedDate: new Date(Date.now() + daysToAdd * 86_400_000),
      onConfirm: commit,
    });
  };

  // «Не выходит на связь» — до 3 попыток (см. UNREACHABLE_MAX_ATTEMPTS в
  // LeadCard.jsx). «Перенос» открывает TrialFormModal отдельно — новая дата
  // пробного сама по себе следующий шаг, дедлайну на неё взяться неоткуда.
  // «Неуспешно», пока попытки не исчерпаны, требует дедлайн следующего
  // звонка — тот же паттерн подтверждения, что и markAttempt выше.
  const markUnreachable = (lead, result) => {
    const attempts = [...(lead.unreachableAttempts ?? []), { result, at: new Date() }];
    const attemptsExhausted = attempts.length >= 3;

    const commit = (dueDate) => patch(lead, { unreachableAttempts: attempts, unreachableNextCallDueAt: dueDate });

    if (result === 'reschedule' || attemptsExhausted) {
      commit(null);
      return;
    }
    setDeadlineTarget({ lead, title: 'Дедлайн следующего звонка', suggestedDate: unreachableCallDueAt(), onConfirm: commit });
  };

  const openAddForm = () => setFormLead({});

  const handleCreated = () => {
    // новый лид уже создан с funnelStage:'new' в StudentFormModal — писать
    // здесь больше нечего, доска подхватит его через onSnapshot.
  };

  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onEdit: (lead) => setFormLead(lead),
    onDecline: (lead) => setDeclineTarget(lead),
    onDelete: (lead) => setDeleteTarget(lead),
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
      const commit = (dueDate) =>
        updateDoc(doc(db, 'students', lead.id), {
          funnelStage: 'closing',
          attended: true,
          engagementScore,
          closingTouchNumber: 0,
          nextTouchAt: dueDate,
          stageHistory,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        }).catch(() => showToast('Не удалось сохранить явку.', { type: 'error' }));
      setDeadlineTarget({ lead, title: 'Дедлайн первого касания в «Дожиме»', suggestedDate: firstTouchDueAt(), onConfirm: commit });
    },
    onMarkTouch: markTouch,
    onMove: moveLead,
    onMarkAttempt: markAttempt,
    onMarkUnreachable: markUnreachable,
    onToggleCallReminder: (lead, checked) => patch(lead, { callReminderDone: checked }),
  };

  return (
    <div>
      {canSeeAllLeads && (
        // fixed в угол экрана — не участвует в потоке страницы (колонки
        // начинаются сразу сверху) и не переезжает поверх шапок колонок
        // при горизонтальном скролле доски, в отличие от absolute сверху.
        <div className="fixed bottom-4 right-4 z-10 flex gap-1 rounded-full bg-surface-alt p-1 shadow-hover">
          {[
            { value: false, label: 'Все' },
            { value: true, label: 'Только мои' },
          ].map((t) => (
            <button
              key={String(t.value)}
              type="button"
              onClick={() => setShowOnlyMine(t.value)}
              className={`rounded-full px-3 py-1.5 text-[13px] ${
                showOnlyMine === t.value ? 'bg-navy text-white' : 'text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2">
        {resolvedColumns.map((column) => (
          <LeadColumn
            key={column.key}
            column={column}
            leads={byColumn[column.key]}
            operatorByUid={operatorByUid}
            onAdd={column.key === 'new' ? openAddForm : undefined}
            onEditColumn={editStageColumn}
            columns={resolvedColumns}
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
      <DeleteLeadModal lead={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <TrialFormModal target={trialTarget} timeSlots={branchSettings?.trialTimeSlots} onClose={() => setTrialTarget(null)} />
      <DeadlineModal target={deadlineTarget} onClose={() => setDeadlineTarget(null)} />
    </div>
  );
}
