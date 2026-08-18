// src/lib/groupCapacity.js
import { format } from 'date-fns';
import { NON_TERMINAL_STAGES } from './leadFunnel.js';

/** Мест под пробных на одну группу — те же 2, что и раньше в ручной брони. */
export const SLOTS_PER_GROUP = 2;

/**
 * Подходит ли группа под слот курс+время+(конкретная дата ИЛИ тип
 * расписания). С датой — реальная проверка календаря (чётный/нечётный день
 * месяца, день недели из schedule.weekdays); без даты — просто сравнение
 * типа расписания (для ручного просмотра «Дни» в GroupBookingModal, где
 * оператор смотрит вперёд без привязки к конкретному дню).
 * @param {Object} group
 * @param {{time: string, date?: Date, scheduleType?: string}} slot
 * @returns {boolean}
 */
export function groupMatchesSlot(group, { time, date, scheduleType }) {
  if ((group.schedule?.time ?? '') !== time) return false;
  const type = group.schedule?.type;
  if (date) {
    if (type === 'even') return date.getDate() % 2 === 0;
    if (type === 'odd') return date.getDate() % 2 === 1;
    if (type === 'weekdays') return (group.schedule.weekdays ?? []).includes(date.getDay());
    return false;
  }
  return type === scheduleType;
}

/**
 * Занятость пула лотов курс+время+Дни — лотов всего matchingGroups.length*2,
 * заняты те, чей пробный (trialCourseId/trialDate) реально попадает в этот
 * же набор групп. Бронь нигде отдельно не пишется — это чистый derived-
 * подсчёт по уже существующим полям лида (спека: «места автоматически
 * бронируются когда оператор вводит пробного», без отдельного действия).
 * @param {Object} params
 * @param {Array<Object>} params.groups группы branchId (не архивные)
 * @param {Array<Object>} params.leads все лиды доски
 * @param {string} params.courseId
 * @param {string} params.time "18:30"
 * @param {string} params.scheduleType 'even'|'odd'|'weekdays'
 * @param {string} [params.excludeLeadId] не считать самого лида, если у него уже есть такой же пробный
 * @returns {{matchingGroups: Array<Object>, totalSlots: number, occupiedCount: number}}
 */
export function computeSlotOccupancy({ groups, leads, courseId, time, scheduleType, excludeLeadId }) {
  const matchingGroups = groups.filter((g) => g.courseId === courseId && groupMatchesSlot(g, { time, scheduleType }));
  const totalSlots = matchingGroups.length * SLOTS_PER_GROUP;

  const occupiedCount = leads.filter((l) => {
    if (l.id === excludeLeadId) return false;
    if (!NON_TERMINAL_STAGES.includes(l.funnelStage ?? 'new')) return false;
    if (l.trialCourseId !== courseId) return false;
    const d = l.trialDate?.toDate?.();
    if (!d || format(d, 'HH:mm') !== time) return false;
    return matchingGroups.some((g) => groupMatchesSlot(g, { time, date: d }));
  }).length;

  return { matchingGroups, totalSlots, occupiedCount };
}

/**
 * Раскладывает общее число занятых лотов по группам поровну (2 на группу) —
 * чисто для отображения «сколько занято в этой конкретной группе», реальной
 * привязки занятого лота к конкретной группе нет (пул общий), это лишь
 * наглядное распределение по порядку.
 * @param {Array<Object>} matchingGroups
 * @param {number} occupiedCount
 * @returns {Array<{group: Object, occupied: number}>}
 */
export function distributeOccupancy(matchingGroups, occupiedCount) {
  let remaining = occupiedCount;
  return matchingGroups.map((group) => {
    const occupied = Math.min(SLOTS_PER_GROUP, Math.max(0, remaining));
    remaining -= occupied;
    return { group, occupied };
  });
}
