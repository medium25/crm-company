// src/pages/LeadsPage.jsx
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { collection, doc, query, where, orderBy, onSnapshot, updateDoc, setDoc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useDoc } from '../hooks/useDoc.js';
import { useAuth } from '../hooks/useAuth.js';
import { notifySheetsExport } from '../lib/sheetsExportHook.js';
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
import { DropdownMenu } from '../components/ui/DropdownMenu.jsx';
import { COLUMNS, columnKeyOf, isForwardAllowed, withStageOverrides } from '../components/leads/columns.js';
import { checklistPercent, DEFAULT_CHECKLIST_ITEMS } from '../lib/leadChecklist.js';
import { taskSnapshot } from '../lib/leadTasks.js';
import { advanceStage, nextCallDueAt, firstTouchDueAt, secondTouchDueAt, unreachableCallDueAt } from '../lib/leadFunnel.js';
import { playNewLeadChime } from '../lib/notificationSound.js';

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

  // Переход с «Задачи» (?highlight=leadId, см. TasksPage.jsx «Выполнить») —
  // прокручиваем доску к нужной карточке и на пару секунд подсвечиваем её
  // рамкой, вместо того чтобы сразу открывать её детальную страницу лида
  // (оператор должен видеть карточку в контексте колонки, не отдельным окном).
  const [searchParams] = useSearchParams();
  const highlightLeadId = searchParams.get('highlight');
  // t — метка повторного перехода к тому же лиду (поиск), иначе эффект ниже не сработал бы второй раз
  const highlightNonce = searchParams.get('t');
  const fromTasks = searchParams.get('from') === 'tasks';
  const [activeHighlight, setActiveHighlight] = useState(highlightLeadId);
  useEffect(() => {
    if (!highlightLeadId) return;
    setActiveHighlight(highlightLeadId);
    let attempts = 0;
    const id = setInterval(() => {
      attempts += 1;
      const el = document.getElementById(`lead-card-${highlightLeadId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        clearInterval(id);
        setTimeout(() => setActiveHighlight(null), 3000);
      } else if (attempts > 20) {
        clearInterval(id);
      }
    }, 150);
    return () => clearInterval(id);
  }, [highlightLeadId, highlightNonce]);
  // Ceo/manager видят все заявки филиала по умолчанию, с кнопкой
  // переключения на «только мои»; остальные роли (admin/teacher) всегда
  // видят только назначенные лично им — без кнопки, переключать нечего.
  // test — исключение: у него нет своей очереди лидов как у оператора
  // (создан для проверки раздела, не для реальной работы с лидами), без
  // этого видел бы всегда пустую доску, сколько бы лидов ни было в системе.
  const canSeeAllLeads = staff?.role === 'ceo' || staff?.role === 'manager' || staff?.role === 'test';
  // 'all' | 'mine' | <operator uid> — третий режим (конкретный оператор)
  // доступен только ceo/manager, чтобы посмотреть доску глазами одного
  // человека без переключения аккаунта.
  const [operatorFilter, setOperatorFilter] = useState('all');

  // Тёмная тема — только для этой страницы: класс dark ставится на <html>
  // (не на локальный div), чтобы порталы (DropdownMenu/Modal — рендерятся
  // в document.body, вне DOM-поддерева страницы) тоже подхватывали
  // переменные палитры. Снимается при уходе со страницы или выключении —
  // остальной CRM тёмную тему не видит вообще.
  const [darkTheme, setDarkTheme] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkTheme);
    return () => document.documentElement.classList.remove('dark');
  }, [darkTheme]);

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
  // Макс. рекомендуемых попыток дозвона — регулируется через ⚙ в шапке
  // колонки «Дозвон» (см. columns.js), читают markAttempt/nextCallDueAt
  // ниже вместо жёстко зашитого 5.
  const callMaxAttempts = resolvedColumns.find((c) => c.key === 'calling')?.maxTouches ?? 5;
  // Чек-лист первого разговора — список пунктов редактируемый (⚙ на панели
  // чек-листа в LeadCard.jsx), хранится тут же в settings/{branchId}.
  const resolvedChecklistItems = branchSettings?.checklistItems ?? DEFAULT_CHECKLIST_ITEMS;
  const editChecklistItems = (items) => {
    if (!branchSettingsRef) return;
    setDoc(branchSettingsRef, { checklistItems: items }, { merge: true }).catch(() =>
      showToast('Не удалось сохранить чек-лист.', { type: 'error' }),
    );
  };

  const editStageColumn = (stageKey, patch) => {
    if (!branchSettingsRef) return;
    // set+merge, не update — settings/{branchId} может ещё не существовать
    // (создаётся лениво при первом сохранении любой из его настроек), а
    // merge на вложенный объект сохраняет overrides остальных стадий как есть.
    setDoc(branchSettingsRef, { leadStageOverrides: { [stageKey]: patch } }, { merge: true }).catch(() =>
      showToast('Не удалось сохранить стадию.', { type: 'error' }),
    );
  };

  // won/lost раньше скрывались за пределами текущего календарного месяца
  // (чтобы терминальные колонки не росли бесконечно) — теперь вместо
  // скрытия видны все месяцы сразу, но сгруппированы сворачиваемыми
  // секциями по месяцам (groupLeadsByMonth в LeadColumn.jsx), открыт по
  // умолчанию только текущий. Документ никуда не девается, просто рендер
  // был/остаётся под контролем — раньше через фильтр, теперь через collapse.
  // boardHiddenAt — то же самое, но вручную и раньше конца месяца
  // («Оплачено» — крестик на карточке, см. onDismissFromBoard).
  // 'mine' и не-ceo/manager — свой uid; иначе конкретный uid оператора, если
  // выбран из списка; 'all' (только для ceo/manager) — без ограничения.
  const scopedOperatorUid = !canSeeAllLeads
    ? user.uid
    : operatorFilter === 'mine'
      ? user.uid
      : operatorFilter === 'all'
        ? null
        : operatorFilter;

  // Лид из поиска может принадлежать другому оператору, чем выбран в фильтре
  // (ceo/manager) — сбрасываем на «Все», иначе карточки на доске просто нет.
  useEffect(() => {
    if (!highlightLeadId || !canSeeAllLeads || operatorFilter === 'all') return;
    const target = allLeads.find((l) => l.id === highlightLeadId);
    if (target && scopedOperatorUid && target.assignedOperator !== scopedOperatorUid) setOperatorFilter('all');
  }, [highlightLeadId, highlightNonce, allLeads, canSeeAllLeads, operatorFilter, scopedOperatorUid]);

  const leads = useMemo(() => {
    return allLeads.filter((l) => {
      if (scopedOperatorUid && l.assignedOperator !== scopedOperatorUid) return false;
      if (l.boardHiddenAt) return false;
      return true;
    });
  }, [allLeads, scopedOperatorUid]);

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

  // Операторы для выпадающего списка «Оператор» (см. панель фильтра ниже) —
  // роль 'admin' в этом кодовой базе и есть call-center оператор (см.
  // src/lib/roles.js), ceo/manager сами лиды не ведут.
  const operatorOptions = useMemo(
    () => staffList.filter((s) => s.role === 'admin').sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [staffList],
  );

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
  /**
   * Пишет саму попытку звонка (callLogs + students.callAttempts) — общая
   * часть для обоих исходов (успех/неудача), опционально с комментарием
   * и доп. полями стадии (переход new→calling всегда, calling→lost при 5
   * неудачах подряд).
   */
  const commitCallAttempt = async (lead, nextAttempts, result, { dueDate = null, comment = '', stageFields = {} } = {}) => {
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
      if (comment) {
        batch.set(doc(collection(db, 'comments')), {
          entityType: 'lead',
          entityId: lead.id,
          text: comment,
          authorId: user.uid,
          authorName: staff?.fullName ?? '',
          createdAt: serverTimestamp(),
        });
      }
      // serverTimestamp() внутри элемента массива не поддерживается Firestore —
      // callAttempts.at/stageHistory.enteredAt используют клиентское время,
      // updatedAt/lostAt документа ниже — уже верхнеуровневые поля, им можно.
      batch.update(doc(db, 'students', lead.id), {
        callAttempts: nextAttempts,
        nextCallDueAt: dueDate,
        ...(comment ? { commentsCount: increment(1) } : {}),
        ...stageFields,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      if (stageFields.funnelStage) notifySheetsExport(lead.id, stageFields.funnelStage, lead.rawColumns);
      if (stageFields.funnelStage === 'lost') showToast(`${lead.fullName}: ${callMaxAttempts} неудачных попыток, лид отмечен как отказ.`);
    } catch {
      showToast('Не удалось отметить попытку.', { type: 'error' });
    }
  };

  const markAttempt = (lead, result) => {
    const snapshot = taskSnapshot(lead);
    const attempts = lead.callAttempts ?? [];
    if (attempts.length >= callMaxAttempts) return;
    // expectedBy — дедлайн, действовавший НА МОМЕНТ этой попытки (тот, что
    // уже лежал на лиде до неё) — нужен для разбора отклонений при отказе
    // (см. src/lib/leadDeviationAnalysis.js): «просрочка при звонке N»
    // сравнивает факт (at) с этим дедлайном, а не с тем, что назначается
    // следующим шагом. null у старых лидов без этого поля — разбор тогда
    // приблизительно восстанавливает дедлайн по стандартной сетке. `outcome`
    // («Что произошло?») + `nextStep` («Следующий шаг») — обязательны для
    // КАЖДОГО касания (успех и неудача через одну и ту же модалку),
    // известны только после того, как оператор впишет их в модалке, поэтому
    // сам итоговый объект попытки собирается отложенно (buildAttempts),
    // а не сразу тут.
    // `at` передаётся явно (не new Date() внутри), а не сама попытка целиком —
    // чтобы момент касания и момент связанного перехода стадии (buildStageFields)
    // всегда совпадали. Раньше stageHistory.enteredAt считался ОДИН раз в самом
    // начале markAttempt (в момент клика по точке, до открытия модалки), а
    // entry.at — только на «Подтвердить» (секунды/минуты спустя, пока
    // заполняли задачу) — из-за этого «Переведён в «Дозвон»» в истории иногда
    // оказывался РАНЬШЕ самой попытки, что его вызвала.
    const buildAttempts = (outcome, nextStep, at) => [
      ...attempts,
      { result, at, expectedBy: lead.nextCallDueAt ?? null, outcome, nextStep, by: user.uid, ...snapshot },
    ];
    // Автопереход 'new' → 'calling' по первой же отметке — тем же `at`, что
    // и у самой попытки (см. выше), иначе переход в истории «обгонял» бы
    // вызвавшую его попытку.
    const buildStageFields = (at) =>
      columnKeyOf(lead) === 'new'
        ? { funnelStage: 'calling', stageHistory: [...(lead.stageHistory ?? []), { stage: 'calling', enteredAt: at }] }
        : {};
    // Превью без outcome/nextStep — только чтобы посчитать предлагаемый
    // дедлайн ДО того, как задача введена (nextCallDueAt читает только
    // length/result).
    const preview = [...attempts, { result }];

    // «Успешно»/«Не успешно» ведут через одну и ту же простую модалку
    // (Что произошло/Следующий шаг/Дедлайн) — трёхкнопочный выбор исхода
    // (Думает/Запись на пробный/Отказ, CallSuccessOutcomeModal) убран по
    // просьбе, запись на пробный/отказ теперь только через «⋮» на карточке.
    const isCold = result === 'fail' && preview.length === callMaxAttempts && attempts.every((a) => a.result === 'fail');
    if (isCold) {
      // терминальная стадия «Отказ» — дедлайну взяться неоткуда, но задача
      // (итог последней попытки) всё равно обязательна — noDate-модалка.
      setDeadlineTarget({
        lead,
        title: `Задача — итог ${callMaxAttempts}-й попытки`,
        noDate: true,
        requireTask: true,
        onConfirm: (_date, outcome, nextStep) => {
          const at = new Date();
          return commitCallAttempt(lead, buildAttempts(outcome, nextStep, at), result, {
            stageFields: {
              funnelStage: 'lost',
              lostReason: 'cold_lead',
              lostAt: serverTimestamp(),
              stageHistory: [...(lead.stageHistory ?? []), { stage: 'lost', enteredAt: at }],
            },
          });
        },
      });
      return;
    }
    setDeadlineTarget({
      lead,
      title: 'Следующая задача:',
      suggestedDate: nextCallDueAt(preview, callMaxAttempts),
      requireTask: true,
      onConfirm: (dueDate, outcome, nextStep) => {
        const at = new Date();
        commitCallAttempt(lead, buildAttempts(outcome, nextStep, at), result, { dueDate, stageFields: buildStageFields(at) });
      },
    });
  };

  // Пока по лиду не отмечен ни один пункт чек-листа первого разговора (см.
  // src/lib/leadChecklist.js) — нельзя переносить дальше по воронке
  // (moveLead). «Пробный назначен» и «Отказ» из-под этого гейта убраны по
  // просьбе — туда можно без отметок в чек-листе.
  const checklistBlocksLeaving = (lead) =>
    (columnKeyOf(lead) === 'new' || columnKeyOf(lead) === 'calling') &&
    checklistPercent(lead.checklist, resolvedChecklistItems) === 0;

  const moveLead = (lead, stageKey) => {
    if (columnKeyOf(lead) === stageKey) return;
    if (!isForwardAllowed(columnKeyOf(lead), stageKey)) {
      showToast('Нельзя вернуть лида на предыдущую стадию.', { type: 'error' });
      return;
    }
    if (stageKey !== 'calling' && stageKey !== 'trial_scheduled' && stageKey !== 'lost' && checklistBlocksLeaving(lead)) {
      showToast('Сначала отметь хотя бы пункт чек-листа разговора.', { type: 'error' });
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
        title: 'Следующая задача:',
        suggestedDate: nextCallDueAt(lead.callAttempts ?? [], callMaxAttempts),
        onConfirm: (dueDate) => commit({ nextCallDueAt: dueDate }),
      });
      return;
    }
    if (stageKey === 'closing') {
      setDeadlineTarget({
        lead,
        title: 'Дедлайн первого касания в «Дожиме»',
        suggestedDate: firstTouchDueAt(lead.trialDate?.toDate?.()),
        onConfirm: (dueDate) => commit({ closingTouchNumber: 0, nextTouchAt: dueDate, unreachableAttempts: [], closingTouchLog: [] }),
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
  // за день до второго урока, второе — в день второго урока. Даты —
  // только подсказка для предзаполнения, оператор ставит любое время в
  // рабочих часах.
  // Задача и дедлайн следующего действия обязательны на КАЖДОМ касании,
  // включая финальное (2-е) — предзаполняется «конец следующего дня».
  const markTouch = (lead) => {
    const snapshot = taskSnapshot(lead);
    const nextNumber = (lead.closingTouchNumber ?? 0) + 1;
    const isFinal = nextNumber >= 2;
    // closingTouchLog — параллельно counter'у closingTouchNumber, только
    // для разбора отклонений при отказе (leadDeviationAnalysis.js): сам
    // счётчик не хранит, КОГДА было касание и был ли дедлайн, лог хранит.
    const buildLog = (outcome, nextStep) => [...(lead.closingTouchLog ?? []), { at: new Date(), expectedBy: lead.nextTouchAt ?? null, outcome, nextStep, by: user.uid, ...snapshot }];

    if (isFinal) {
      setDeadlineTarget({
        lead,
        title: `Задача — касание ${nextNumber}`,
        suggestedDate: unreachableCallDueAt(),
        requireTask: true,
        onConfirm: (dueDate, outcome, nextStep) =>
          patch(
            lead,
            { closingTouchNumber: nextNumber, nextTouchAt: dueDate, unreachableAttempts: [], closingTouchLog: buildLog(outcome, nextStep) },
            `Касание ${nextNumber} отмечено.`,
          ),
      });
      return;
    }
    setDeadlineTarget({
      lead,
      title: 'Дедлайн второго касания',
      suggestedDate: secondTouchDueAt(lead.trialDate?.toDate?.()),
      requireTask: true,
      onConfirm: (dueDate, outcome, nextStep) =>
        patch(
          lead,
          { closingTouchNumber: nextNumber, nextTouchAt: dueDate, unreachableAttempts: [], closingTouchLog: buildLog(outcome, nextStep) },
          `Касание ${nextNumber} отмечено.`,
        ),
    });
  };

  // «Не выходит на связь» — до 3 попыток (см. UNREACHABLE_MAX_ATTEMPTS в
  // LeadCard.jsx), тот же сценарий на «Пробный назначен» и в «Дожиме».
  // На пробном «Перенос» открывает TrialFormModal отдельно (новая дата
  // пробного сама по себе следующий шаг), «Неуспешно» требует дедлайн
  // следующего звонка. В «Дожиме» нет отдельной формы переноса — там и
  // «Перенос», и «Неуспешно» одинаково просят новый дедлайн касания
  // (то же поле nextTouchAt, что и у markTouch). Задача обязательна на
  // каждой попытке, включая «Перенос» и случай исчерпанных 3 попыток (там
  // раньше коммитили молча, без модалки вообще — noDate-задача добавлена).
  // `onRescheduleCb` — пробрасывается из LeadCard.jsx (UnreachableBlock),
  // вызывается ПОСЛЕ того, как задача сохранена, а не раньше — иначе
  // TrialFormModal открылся бы поверх ещё не закрытой DeadlineModal.
  const markUnreachable = (lead, result, onRescheduleCb) => {
    const snapshot = taskSnapshot(lead);
    // expectedBy — тот же смысл, что у markAttempt: дедлайн, действовавший
    // до этой попытки (для «Дожима» — nextTouchAt, на «Пробном» —
    // unreachableNextCallDueAt), нужен разбору отклонений при отказе.
    const expectedBy = (lead.funnelStage === 'closing' ? lead.nextTouchAt : lead.unreachableNextCallDueAt) ?? null;
    const priorAttempts = lead.unreachableAttempts ?? [];
    const buildAttempts = (outcome, nextStep) => [...priorAttempts, { result, at: new Date(), expectedBy, outcome, nextStep, by: user.uid, ...snapshot }];
    const attemptsExhausted = priorAttempts.length + 1 >= 3;

    if (lead.funnelStage === 'closing') {
      if (attemptsExhausted) {
        setDeadlineTarget({
          lead,
          title: 'Дедлайн следующего касания',
          suggestedDate: unreachableCallDueAt(),
          requireTask: true,
          onConfirm: (dueDate, outcome, nextStep) => patch(lead, { unreachableAttempts: buildAttempts(outcome, nextStep), nextTouchAt: dueDate }),
        });
        return;
      }
      setDeadlineTarget({
        lead,
        title: 'Дедлайн следующего касания',
        suggestedDate: unreachableCallDueAt(),
        requireTask: true,
        onConfirm: (dueDate, outcome, nextStep) => patch(lead, { unreachableAttempts: buildAttempts(outcome, nextStep), nextTouchAt: dueDate }),
      });
      return;
    }

    if (result === 'reschedule') {
      setDeadlineTarget({
        lead,
        title: 'Задача — перенос пробного',
        suggestedDate: unreachableCallDueAt(),
        requireTask: true,
        onConfirm: async (dueDate, outcome, nextStep) => {
          await patch(lead, { unreachableAttempts: buildAttempts(outcome, nextStep), unreachableNextCallDueAt: dueDate });
          onRescheduleCb?.();
        },
      });
      return;
    }
    if (attemptsExhausted) {
      setDeadlineTarget({
        lead,
        title: 'Дедлайн следующего звонка',
        suggestedDate: unreachableCallDueAt(),
        requireTask: true,
        onConfirm: (dueDate, outcome, nextStep) =>
          patch(lead, { unreachableAttempts: buildAttempts(outcome, nextStep), unreachableNextCallDueAt: dueDate }),
      });
      return;
    }
    setDeadlineTarget({
      lead,
      title: 'Следующая задача:',
      suggestedDate: unreachableCallDueAt(),
      requireTask: true,
      onConfirm: (dueDate, outcome, nextStep) =>
        patch(lead, { unreachableAttempts: buildAttempts(outcome, nextStep), unreachableNextCallDueAt: dueDate }),
    });
  };

  const openAddForm = () => setFormLead({});

  const handleCreated = () => {
    // новый лид уже создан с funnelStage:'new' в StudentFormModal — писать
    // здесь больше нечего, доска подхватит его через onSnapshot.
  };

  const cardActions = {
    onOpen: (lead) => navigate(`/students/${lead.id}`),
    onEdit: (lead) => setFormLead(lead),
    // Отказ — без гейта чек-листа: причину отказа можно указать в любой момент.
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
    onEditChecklist: editChecklistItems,
    highlightLeadId: activeHighlight,
  };

  return (
    <div>
      {/* Виден только при переходе с «Задачи» (?highlight=...&from=tasks) — быстрый
          путь назад, не полагаясь на кнопку «Назад» браузера (карточку уже
          проскроллили/подсветили, обычный «назад» увёл бы на пустой список
          без этого состояния). */}
      {highlightLeadId && fromTasks && (
        <Link
          to="/tasks"
          className="fixed bottom-4 left-4 z-10 flex items-center gap-1 rounded-full bg-navy px-4 py-2 text-[13px] font-bold text-white shadow-hover hover:bg-navy-hover"
        >
          ← К задачам
        </Link>
      )}
      {/* fixed в угол экрана — не участвует в потоке страницы (колонки
          начинаются сразу сверху) и не переезжает поверх шапок колонок при
          горизонтальном скролле доски, в отличие от absolute сверху. Одна
          кнопка на весь фильтр (не 3 сегмента) — открывает меню со всеми
          вариантами разом (Все/Только мои/каждый оператор); тема — рядом. */}
      <div className="fixed bottom-4 right-4 z-10 flex items-center gap-1 rounded-full bg-surface-alt p-1 shadow-hover">
        {canSeeAllLeads && (
          <DropdownMenu
            items={[
              { label: 'Все', onClick: () => setOperatorFilter('all') },
              { label: 'Только мои', onClick: () => setOperatorFilter('mine') },
              ...operatorOptions.map((op) => ({ label: op.fullName, onClick: () => setOperatorFilter(op.id) })),
            ]}
            trigger={({ ref, toggle }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                className="rounded-full bg-navy px-3 py-1.5 text-[13px] text-white"
              >
                {operatorFilter === 'all'
                  ? 'Все'
                  : operatorFilter === 'mine'
                    ? 'Только мои'
                    : (operatorOptions.find((op) => op.id === operatorFilter)?.fullName ?? 'Все')}
                {' ▾'}
              </button>
            )}
          />
        )}
        <button
          type="button"
          onClick={() => setDarkTheme((v) => !v)}
          aria-label={darkTheme ? 'Светлая тема' : 'Тёмная тема'}
          title={darkTheme ? 'Светлая тема' : 'Тёмная тема'}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-text"
        >
          {darkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
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
            checklistItems={resolvedChecklistItems}
            onDropLead={(leadId, columnKey) => {
              const lead = leadsById.get(leadId);
              if (lead) moveLead(lead, columnKey);
            }}
            {...cardActions}
          />
        ))}
      </div>

      <StudentFormModal student={formLead} onClose={() => setFormLead(null)} onCreated={handleCreated} />
      <DeclineLeadModal lead={declineTarget} onClose={() => setDeclineTarget(null)} callMaxAttempts={callMaxAttempts} />
      <DeleteLeadModal lead={deleteTarget} onClose={() => setDeleteTarget(null)} />
      <ResetLeadModal lead={resetTarget} onClose={() => setResetTarget(null)} />
      <DismissFromBoardModal lead={dismissTarget} onClose={() => setDismissTarget(null)} />
      <TrialFormModal target={trialTarget} timeSlots={branchSettings?.trialTimeSlots} onClose={() => setTrialTarget(null)} />
      <DeadlineModal target={deadlineTarget} onClose={() => setDeadlineTarget(null)} />
      <GroupBookingModal lead={bookingTarget} allLeads={allLeads} onClose={() => setBookingTarget(null)} />
    </div>
  );
}
