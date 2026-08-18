// src/lib/leadFunnel.js
import { doc, getDoc, updateDoc, collection, query, where, getCountFromServer, serverTimestamp, writeBatch, getDocs } from 'firebase/firestore';
import { differenceInCalendarDays, addDays } from 'date-fns';

/**
 * Причины отказа — фиксированный список (см. спек §7). `requiresDetail` —
 * для этих двух свободный текст обязателен (DeclineLeadModal), для
 * остальных выбора причины из списка достаточно.
 */
export const LOST_REASON_OPTIONS = [
  { value: 'no_agreement', label: 'Не смогли договориться', requiresDetail: true },
  { value: 'invalid_number', label: 'Несуществующий номер' },
  { value: 'inadequate', label: 'Неадекватный человек', requiresDetail: true },
  { value: 'cold_lead', label: 'Холодный лид (не дозвонились)' },
];

/**
 * Единая точка записи смены стадии — пишет `funnelStage`, дописывает
 * `stageHistory` (для отчёта по воронке, §10 спека) и `updatedAt`/
 * `updatedBy`. Все места, что меняют стадию лида, обязаны идти через эту
 * функцию, иначе `stageHistory` разойдётся с реальными переходами.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Object} lead текущий документ лида (нужен lead.stageHistory)
 * @param {string} newStage
 * @param {Object} extraFields доп. поля этого же updateDoc (например lostReason)
 * @param {{uid: string}} user
 */
export async function advanceStage(db, lead, newStage, extraFields, user) {
  await updateDoc(doc(db, 'students', lead.id), {
    funnelStage: newStage,
    stageHistory: [...(lead.stageHistory ?? []), { stage: newStage, enteredAt: new Date() }],
    ...extraFields,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

const WORKING_START_HOUR = 9;
const WORKING_END_HOUR = 18;

function isWithinWorkingHours(date) {
  return date.getDay() !== 0 && date.getHours() >= WORKING_START_HOUR && date.getHours() < WORKING_END_HOUR;
}

/** 9:00 следующего рабочего дня (пропускает воскресенье) относительно `date`. */
function nextWorkingStart(date) {
  const d = new Date(date);
  if (d.getHours() >= WORKING_END_HOUR || d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
    d.setHours(WORKING_START_HOUR, 0, 0, 0);
    while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  } else {
    d.setHours(WORKING_START_HOUR, 0, 0, 0);
  }
  return d;
}

/** Лид вне рабочих часов на момент создания — визуальная метка priority (спек §3). */
export function isPriorityLead(createdAt) {
  return !isWithinWorkingHours(createdAt);
}

/** Дедлайн SLA (15 минут в рабочее время, иначе — 15 минут от начала следующего рабочего дня). */
export function slaDeadline(createdAt) {
  const start = isWithinWorkingHours(createdAt) ? createdAt : nextWorkingStart(createdAt);
  return new Date(start.getTime() + 15 * 60_000);
}

const END_OF_DAY_HOUR = 18;

function endOfDayIn(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(END_OF_DAY_HOUR, 0, 0, 0);
  return d;
}

/**
 * Дедлайн следующей попытки дозвона — сетка 2 сегодня/2 завтра/1
 * послезавтра (конец рабочего дня). Пишется на документ лида при каждой отметке
 * попытки (`markAttempt`), чтобы карточка не «зависала» в «Дозвоне»
 * незамеченной. `null` — попыток не осталось (5 уже сделано).
 * @param {Array<{result: 'success'|'fail'}>} attempts
 * @returns {Date|null}
 */
export function nextCallDueAt(attempts) {
  const n = attempts.length;
  if (n === 0 || n >= 5) return null;
  const daysAhead = n < 2 ? 0 : n < 4 ? 1 : 2;
  return endOfDayIn(daysAhead);
}

/**
 * Дожим — ровно 2 касания, привязанные ко «второму уроку» (пробный
 * считаем первым; лид ещё не записан в конкретную группу, поэтому второй
 * урок — trialDate + 2 дня, стандартный шаг занятия через день). Первое
 * касание — за день до второго урока, второе — в день второго урока. Оба
 * дедлайна фиксированы (DeadlineModal.lockDate) — оператор не выбирает
 * день, только время в пределах него.
 * @param {Date} [trialDate]
 * @returns {Date}
 */
export function firstTouchDueAt(trialDate) {
  const d = addDays(trialDate ?? new Date(), 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

/** @param {Date} [trialDate] @returns {Date} */
export function secondTouchDueAt(trialDate) {
  const d = addDays(trialDate ?? new Date(), 2);
  d.setHours(18, 0, 0, 0);
  return d;
}

/**
 * Дедлайн звонка-подтверждения перед пробным — trialDate минус 24 часа
 * (спек «Данные»). Пишется на документ лида при назначении и при каждом
 * переносе пробного (TrialFormModal), читается в stageDeadline.
 * @param {Date} trialDate
 * @returns {Date}
 */
export function trialConfirmDueAt(trialDate) {
  return new Date(trialDate.getTime() - 24 * 60 * 60 * 1000);
}

/**
 * Дедлайн следующего звонка после отметки «не выходит на связь» (попытка
 * дозвона до дня пробного) — конец следующего дня, тот же ориентир, что и
 * у обычного дозвона. Оператор правит перед сохранением в DeadlineModal,
 * это только предложение.
 * @returns {Date}
 */
export function unreachableCallDueAt() {
  return endOfDayIn(1);
}

// Пробный в 9:00 — самый ранний слот, до занятия утром звонить уже некогда,
// поэтому для него контактный день сдвигается на день раньше. Для всех
// остальных слотов (от 10:30) контакт — в день самого пробного.
const EARLY_SLOT_HOUR = 10;
const EARLY_SLOT_MINUTE = 30;

/**
 * День, когда нужно связаться с лидом перед пробным — сам день пробного,
 * кроме самого раннего слота (9:00), для которого это день накануне.
 * @param {Date} trialDate
 * @returns {Date}
 */
export function contactDueDate(trialDate) {
  const isEarlySlot = trialDate.getHours() < EARLY_SLOT_HOUR || (trialDate.getHours() === EARLY_SLOT_HOUR && trialDate.getMinutes() < EARLY_SLOT_MINUTE);
  return isEarlySlot ? addDays(trialDate, -1) : trialDate;
}

/**
 * Наступил ли уже контактный день (см. contactDueDate) или прошёл —
 * сравнение по дате, не по времени суток. С этого момента карточка
 * показывает «Не выходит на связь»/«Напомнить через звонок», и дедлайн
 * стадии возвращается к contactDueDate (см. stageDeadline ниже).
 * @param {Date} trialDate
 * @returns {boolean}
 */
export function isTrialDay(trialDate) {
  return differenceInCalendarDays(contactDueDate(trialDate), new Date()) <= 0;
}

/**
 * Дедлайн следующего действия по лиду — единая проверка «не залежалась ли
 * карточка» для всех нетерминальных стадий (каждое следующее действие
 * переназначает его заново, см. соответствующие вызовы в LeadsPage.jsx).
 * `null` для стадий без операторского действия (`trial_completed` —
 * мгновенный переход) и терминальных (`won`/`lost`).
 * @param {Object} lead
 * @returns {Date|null}
 */
export function stageDeadline(lead) {
  const stage = lead.funnelStage ?? 'new';
  if (stage === 'new') return lead.createdAt?.toDate ? slaDeadline(lead.createdAt.toDate()) : null;
  if (stage === 'calling') return lead.nextCallDueAt?.toDate?.() ?? null;
  if (stage === 'trial_scheduled') {
    // Два независимых источника дедлайна: назначенный звонок после «не
    // выходит на связь» (unreachableNextCallDueAt, пока не отметили
    // следующую попытку) и день пробного (пока не отмечена галочка
    // «Напомнить через звонок») — берём ближайший из тех, что применимы.
    const trialDate = lead.trialDate?.toDate?.();
    const trialDayDue = trialDate && isTrialDay(trialDate) && !lead.callReminderDone ? contactDueDate(trialDate) : null;
    const unreachableDue = lead.unreachableNextCallDueAt?.toDate?.() ?? null;
    const candidates = [trialDayDue, unreachableDue].filter(Boolean);
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => (a < b ? a : b));
  }
  if (stage === 'closing') return lead.nextTouchAt?.toDate?.() ?? null;
  return null;
}

/**
 * Человекочитаемая причина, почему карточка помечена просроченной (бейдж
 * с «!» в углу LeadCard) — что именно не сделали вовремя, по стадии.
 * Дату/время дедлайна вызывающая сторона добавляет сама (formatDateTimeShort
 * от stageDeadline(lead)).
 * @param {Object} lead
 * @returns {string}
 */
export function overdueReasonLabel(lead) {
  const stage = lead.funnelStage ?? 'new';
  if (stage === 'new') return 'Лид не обработан — истёк срок на первый звонок';
  if (stage === 'calling') return 'Просрочен повторный звонок';
  if (stage === 'trial_scheduled') {
    const trialDate = lead.trialDate?.toDate?.();
    const trialDayDue = trialDate && isTrialDay(trialDate) && !lead.callReminderDone ? contactDueDate(trialDate) : null;
    const unreachableDue = lead.unreachableNextCallDueAt?.toDate?.() ?? null;
    if (unreachableDue && (!trialDayDue || unreachableDue <= trialDayDue)) return 'Просрочен повторный звонок «не выходит на связь»';
    return 'Не отмечено напоминание звонком перед пробным';
  }
  if (stage === 'closing') return 'Просрочено плановое касание в дожиме';
  return 'Просрочено плановое действие по лиду';
}

/**
 * Список операторов для распределения лидов — `settings/{branchId}.activeLeadOperators`
 * (настраивается в Настройки → Распределение лидов). Пока никто не
 * настроил — пуст, вызывающая сторона решает, что делать (см.
 * assignLeastLoadedOperator).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @returns {Promise<Array<string>>}
 */
export async function getActiveLeadOperators(db, branchId) {
  const snap = await getDoc(doc(db, 'settings', branchId));
  return snap.data()?.activeLeadOperators ?? [];
}

/**
 * Назначает лида оператору с наименьшей текущей нагрузкой — суммой карточек
 * в стадиях 'new'+'calling' среди активных операторов (спек: заменяет
 * round-robin, «кому распределять» настраивается отдельно, «кому
 * наименьшей» решает нагрузка на момент создания). Не транзакция — гонка
 * при одновременном создании двух лидов теоретически возможна (оба могут
 * достаться одному и тому же наименее загруженному), не критично для
 * объёма одной школы.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {Array<string>} operatorIds из getActiveLeadOperators
 * @returns {Promise<string|null>} uid назначенного оператора, null если операторов нет
 */
export async function assignLeastLoadedOperator(db, branchId, operatorIds) {
  if (operatorIds.length === 0) return null;
  const counts = await Promise.all(
    operatorIds.map((id) =>
      getCountFromServer(
        query(
          collection(db, 'students'),
          where('assignedOperator', '==', id),
          where('funnelStage', 'in', ['new', 'calling']),
        ),
      ).then((snap) => snap.data().count),
    ),
  );
  let bestIndex = 0;
  for (let i = 1; i < operatorIds.length; i++) {
    if (counts[i] < counts[bestIndex]) bestIndex = i;
  }
  return operatorIds[bestIndex];
}

/**
 * Работает ли оператор в указанный момент — расписание из
 * settings/{branchId}.operatorSchedules[operatorId] (Настройки →
 * Распределение лидов → «Расписание»). `null` в дне — явный выходной,
 * `undefined` (весь массив или запись оператора отсутствует) — тех.дефолт
 * «работает всегда», чтобы ненастроенное расписание молча не выключало
 * оператора из распределения.
 * @param {Array<{start: string, end: string}|null>|undefined} workSchedule
 * @param {Date} date
 * @returns {boolean}
 */
export function isOperatorWorkingAt(workSchedule, date) {
  if (!workSchedule) return true;
  const today = workSchedule[date.getDay()];
  if (today === undefined) return true;
  if (today === null) return false;
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return hhmm >= today.start && hhmm < today.end;
}

/**
 * Операторы из списка, у которых сейчас рабочее время — приоритетное
 * подмножество для назначения лида (см. assignOperatorForLead).
 * @param {Array<{id: string, workSchedule?: Array}>} operators
 * @param {Date} date
 * @returns {Array<string>} id операторов
 */
export function selectOnShiftOperatorIds(operators, date) {
  return operators.filter((op) => isOperatorWorkingAt(op.workSchedule, date)).map((op) => op.id);
}

/**
 * Расписания операторов — settings/{branchId}.operatorSchedules (см. Global
 * Constraints: живёт на settings, не на staff/{id}, из-за ограничения
 * firestore.rules на staff.update для admin-роли).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @returns {Promise<Record<string, Array<{start: string, end: string}|null>>>}
 */
export async function getOperatorSchedules(db, branchId) {
  const snap = await getDoc(doc(db, 'settings', branchId));
  return snap.data()?.operatorSchedules ?? {};
}

/**
 * Назначение лида с учётом расписания: сначала — наименее загруженный среди
 * операторов, у которых сейчас рабочее время; если таких нет — прежняя
 * логика дефицита среди ВСЕХ переданных операторов.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {Array<{id: string, workSchedule?: Array}>} operators активные операторы с их расписанием
 * @param {Date} createdAt момент создания лида (может быть в прошлом — лид из Google Sheets)
 * @returns {Promise<string|null>}
 */
export async function assignOperatorForLead(db, branchId, operators, createdAt) {
  const onShiftIds = selectOnShiftOperatorIds(operators, createdAt);
  const candidateIds = onShiftIds.length > 0 ? onShiftIds : operators.map((op) => op.id);
  return assignLeastLoadedOperator(db, branchId, candidateIds);
}

/** Нетерминальные стадии воронки — "активный" лид для целей ручного перевода между операторами. */
export const NON_TERMINAL_STAGES = ['new', 'calling', 'trial_scheduled', 'trial_completed', 'closing'];

/**
 * id всех активных лидов оператора — для «Перевести всех» (без разворота
 * списка в LeadAssignmentTab). Отфильтровано по branchId — у оператора с
 * несколькими branchIds не должно попадать в перевод то, что относится к
 * другому филиалу (иначе batch на students упадёт целиком из-за
 * firestore.rules isBranch-проверки на чужом документе).
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} operatorId
 * @param {string} branchId
 * @returns {Promise<Array<string>>}
 */
export async function getActiveLeadIdsForOperator(db, operatorId, branchId) {
  const snap = await getDocs(
    query(
      collection(db, 'students'),
      where('branchId', '==', branchId),
      where('assignedOperator', '==', operatorId),
      where('funnelStage', 'in', NON_TERMINAL_STAGES),
    ),
  );
  return snap.docs.map((d) => d.id);
}

/**
 * Массовый перевод лидов другому оператору — меняет только владельца
 * (assignedOperator), funnelStage/stageHistory/дедлайны не трогаются:
 * прогресс по воронке остаётся как есть, переезжает только ответственный.
 * Чанки по 400 — лимит Firestore batch 500, запас на случай большого списка
 * у одного оператора.
 * @param {import('firebase/firestore').Firestore} db
 * @param {Array<string>} leadIds
 * @param {string} newOperatorId
 * @param {{uid: string}} user
 */
export async function reassignLeadsToOperator(db, leadIds, newOperatorId, user) {
  const CHUNK = 400;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const id of leadIds.slice(i, i + CHUNK)) {
      batch.update(doc(db, 'students', id), {
        assignedOperator: newOperatorId,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
    }
    await batch.commit();
  }
}
