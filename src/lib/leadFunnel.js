// src/lib/leadFunnel.js
import { doc, updateDoc, runTransaction, serverTimestamp } from 'firebase/firestore';

/** Причины отказа — фиксированный список, свободный текст не допускается (см. спек §7). */
export const LOST_REASON_OPTIONS = [
  { value: 'expensive', label: 'Дорого' },
  { value: 'bad_timing', label: 'Не время' },
  { value: 'other_school', label: 'Выбрал другую школу' },
  { value: 'no_answer', label: 'Не дозвонились' },
  { value: 'no_show', label: 'Не пришёл на пробный' },
  { value: 'undecided', label: 'Думает' },
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

/**
 * Подсказка расписания дозвона под точками попыток — чисто информационная
 * строка (2 сегодня / 2 завтра / 1 послезавтра из спека §4), без пуш-
 * напоминаний. `null`, если подсказывать нечего (0 попыток или лид уже
 * ушёл с этой стадии).
 * @param {Array<{result: 'success'|'fail'}>} attempts
 */
export function callScheduleHint(attempts) {
  const n = attempts.length;
  if (n === 0 || n >= 5) return null;
  if (n < 2) return 'Ещё сегодня';
  if (n < 4) return 'Завтра';
  return 'Послезавтра';
}

const END_OF_DAY_HOUR = 18;

function endOfDayIn(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(END_OF_DAY_HOUR, 0, 0, 0);
  return d;
}

/**
 * Дедлайн следующей попытки дозвона — та же сетка 2 сегодня/2 завтра/1
 * послезавтра, что и `callScheduleHint`, но как реальная дата (конец
 * рабочего дня), а не текст. Пишется на документ лида при каждой отметке
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
 * Дедлайн первого касания при входе в «Дожим» — вечер того же дня (21:00),
 * либо прямо сейчас, если пробный отмечен уже вечером (спека §6). Дальше
 * `markTouch` пересчитывает дедлайн следующего касания сам при каждой
 * отметке — здесь только точка входа в стадию.
 * @returns {Date}
 */
export function firstTouchDueAt() {
  const d = new Date();
  if (d.getHours() < 21) {
    d.setHours(21, 0, 0, 0);
    return d;
  }
  return d;
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
  if (stage === 'trial_scheduled') return lead.trialDate?.toDate?.() ?? null;
  if (stage === 'closing') return lead.nextTouchAt?.toDate?.() ?? null;
  return null;
}

/**
 * Round-robin назначение оператора при создании лида. Список операторов
 * читается снаружи транзакции (обычный getDocs — сам список меняется
 * редко, 2-3 человека, гонка на устаревший список не критична), но счётчик
 * очереди — `settings/{branchId}.lastRoundRobinIndex` — читается и
 * пишется внутри `runTransaction`, чтобы два лида, созданных почти
 * одновременно, не получили одного и того же следующего оператора.
 * @param {import('firebase/firestore').Firestore} db
 * @param {string} branchId
 * @param {Array<string>} operatorIds уже отсортированный список uid
 * @returns {Promise<string|null>} uid назначенного оператора, null если операторов нет
 */
export async function assignRoundRobinOperator(db, branchId, operatorIds) {
  if (operatorIds.length === 0) return null;
  const settingsRef = doc(db, 'settings', branchId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(settingsRef);
    const index = snap.data()?.lastRoundRobinIndex ?? 0;
    const operator = operatorIds[index % operatorIds.length];
    tx.set(settingsRef, { lastRoundRobinIndex: index + 1 }, { merge: true });
    return operator;
  });
}
