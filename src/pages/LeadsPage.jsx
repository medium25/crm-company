// src/pages/LeadsPage.jsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isSameMonth } from 'date-fns';
import { collection, doc, query, where, orderBy, onSnapshot, updateDoc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useDoc } from '../hooks/useDoc.js';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../components/ui/Toast.jsx';
import { StudentFormModal } from '../components/students/StudentFormModal.jsx';
import { DeclineLeadModal } from '../components/students/DeclineLeadModal.jsx';
import { ResetLeadModal } from '../components/leads/ResetLeadModal.jsx';
import { DismissFromBoardModal } from '../components/leads/DismissFromBoardModal.jsx';
import { DeleteLeadModal } from '../components/students/DeleteLeadModal.jsx';
import { TrialFormModal } from '../components/leads/TrialFormModal.jsx';
import { DeadlineModal } from '../components/leads/DeadlineModal.jsx';
import { GroupBookingModal } from '../components/leads/GroupBookingModal.jsx';
import { LeadColumn } from '../components/leads/LeadColumn.jsx';
import { COLUMNS, columnKeyOf, isForwardAllowed, withStageOverrides } from '../components/leads/columns.js';
import { advanceStage, nextCallDueAt, firstTouchDueAt, secondTouchDueAt, unreachableCallDueAt, validateCallDeadline } from '../lib/leadFunnel.js';
import { playNewLeadChime } from '../lib/notificationSound.js';

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

  // Звук нового лида — играет только тем, у кого сейчас открыта эта
  // страница, при появлении лида в «Новый лид» (вручную или из синка
  // Sheets). Отдельная подписка на тот же query, а не хук useCollection —
  // нужны сырые docChanges, а не готовый список; на первом снапшоте
  // (загрузка уже существующих лидов) звук не играет, только на реальных
  // «added» после него.
  const isFirstLeadsSnapshot = useRef(true);
  useEffect(() => {
    if (!leadsQuery) return;
    isFirstLeadsSnapshot.current = true;
    return onSnapshot(leadsQuery, (snap) => {
      if (isFirstLeadsSnapshot.current) {
        isFirstLeadsSnapshot.current = false;
        return;
      }
      const hasNewLead = snap.docChanges().some((c) => c.type === 'added' && c.doc.data().funnelStage === 'new');
      if (hasNewLead) playNewLeadChime();
    });
  }, [leadsQuery]);

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

  // won/lost видны только в текущем календарном месяце — сбрасываются 1-го
  // числа, а не скользящим окном (иначе терминальные колонки бесконечно
  // растут за месяцы работы, см. план, «Важное архитектурное решение»).
  // Документ никуда не девается, просто не рендерится в этом списке.
  // boardHiddenAt — то же самое, но вручную и раньше конца месяца
  // («Оплачено» — крестик на карточке, см. onDismissFromBoard).
  const leads = useMemo(() => {
    const now = new Date();
    const scopedToSelf = !canSeeAllLeads || showOnlyMine;
    return allLeads.filter((l) => {
      if (scopedToSelf && l.assignedOperator !== user.uid) return false;
      if (l.boardHiddenAt) return false;
      if (!TERMINAL_STAGES.includes(columnKeyOf(l))) return true;
      const at = (l.paidAt ?? l.lostAt ?? l.updatedAt)?.toDate?.();
      return at ? isSameMonth(at, now) : true;
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
  const [bookingTarget, setBookingTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [dismissTarget, setDismissTarget] = useState(null);

  const byColumn = useMemo(() => {
    const map = {};
    for (const c of COLUMNS) map[c.key] = [];
    for (const lead of leads) map[columnKeyOf(lead)].push(lead);
    // «Пробный назначен» — ближайший пробный первым, «Дозвон» — ближайший
    // дедлайн следующего звонка первым, а не по дате создания лида (порядок
    // остальных колонок), чтобы срочное было видно сразу.
    map.trial_scheduled.sort((a, b) => (a.trialDate?.seconds ?? Infinity) - (b.trialDate?.seconds ?? Infinity));
    map.calling.sort((a, b) => (a.nextCallDueAt?.seconds ?? Infinity) - (b.nextCallDueAt?.seconds ?? Infinity));
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
          stageFields.lostReason = 'cold_lead';
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
    setDeadlineTarget({
      lead,
      title: 'Дедлайн следующего звонка',
      suggestedDate: nextCallDueAt(nextAttempts),
      onConfirm: commit,
      validate: (candidate) => validateCallDeadline(candidate, nextAttempts, branchSettings?.operatorSchedules?.[lead.assignedOperator]),
    });
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
        validate: (candidate) => validateCallDeadline(candidate, lead.callAttempts ?? [], branchSettings?.operatorSchedules?.[lead.assignedOperator]),
      });
      return;
    }
    if (stageKey === 'closing') {
      setDeadlineTarget({
        lead,
        title: 'Дедлайн первого касания в «Дожиме»',
        suggestedDate: firstTouchDueAt(lead.trialDate?.toDate?.()),
        onConfirm: (dueDate) => commit({ closingTouchNumber: 0, nextTouchAt: dueDate, unreachableAttempts: [] }),
        lockDate: true,
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

  // Дожим — ровно 2 касания (см. firstTouchDueAt/secondTouchDueAt): первое
  // за день до второго урока, второе — в день второго урока. Оба дня
  // фиксированы датой пробного, оператору выбирать нечего (lockDate).
  const markTouch = (lead) => {
    const nextNumber = (lead.closingTouchNumber ?? 0) + 1;
    const isFinal = nextNumber >= 2;
    const commit = (dueDate) =>
      patch(
        lead,
        { closingTouchNumber: nextNumber, nextTouchAt: isFinal ? null : dueDate, unreachableAttempts: [] },
        `Касание ${nextNumber} отмечено.`,
      );

    if (isFinal) {
      commit(null); // 2-е касание финальное — дальше дожима нет, дедлайну взяться неоткуда
      return;
    }
    setDeadlineTarget({
      lead,
      title: 'Дедлайн второго касания',
      suggestedDate: secondTouchDueAt(lead.trialDate?.toDate?.()),
      onConfirm: commit,
      lockDate: true,
    });
  };

  // «Не выходит на связь» — до 3 попыток (см. UNREACHABLE_MAX_ATTEMPTS в
  // LeadCard.jsx), тот же сценарий на «Пробный назначен» и в «Дожиме».
  // На пробном «Перенос» открывает TrialFormModal отдельно (новая дата
  // пробного сама по себе следующий шаг), «Неуспешно» требует дедлайн
  // следующего звонка. В «Дожиме» нет отдельной формы переноса — там и
  // «Перенос», и «Неуспешно» одинаково просят новый дедлайн касания
  // (то же поле nextTouchAt, что и у markTouch).
  const markUnreachable = (lead, result) => {
    const attempts = [...(lead.unreachableAttempts ?? []), { result, at: new Date() }];
    const attemptsExhausted = attempts.length >= 3;

    if (lead.funnelStage === 'closing') {
      const commit = (dueDate) => patch(lead, { unreachableAttempts: attempts, nextTouchAt: dueDate });
      if (attemptsExhausted) {
        commit(null);
        return;
      }
      setDeadlineTarget({ lead, title: 'Дедлайн следующего касания', suggestedDate: unreachableCallDueAt(), onConfirm: commit });
      return;
    }

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
    onResetToNew: (lead) => setResetTarget(lead),
    onScheduleTrial: (lead) => setTrialTarget({ lead, mode: 'schedule' }),
    onRescheduleTrial: (lead) => setTrialTarget({ lead, mode: 'reschedule' }),
    onOpenBooking: (lead) => setBookingTarget(lead),
    // Только «Оплачено» — убирает карточку с доски, студент остаётся в
    // системе (просто не рендерится больше в этом списке, см. leads выше).
    // По паролю (см. DismissFromBoardModal), чтобы не улетало случайным кликом.
    onDismissFromBoard: (lead) => setDismissTarget(lead),
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
      <ResetLeadModal lead={resetTarget} onClose={() => setResetTarget(null)} />
      <DismissFromBoardModal lead={dismissTarget} onClose={() => setDismissTarget(null)} />
      <TrialFormModal target={trialTarget} timeSlots={branchSettings?.trialTimeSlots} onClose={() => setTrialTarget(null)} />
      <DeadlineModal target={deadlineTarget} onClose={() => setDeadlineTarget(null)} />
      <GroupBookingModal lead={bookingTarget} allLeads={allLeads} onClose={() => setBookingTarget(null)} />
    </div>
  );
}
