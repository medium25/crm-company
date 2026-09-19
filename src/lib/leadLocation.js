// src/lib/leadLocation.js
import { COLUMNS } from '../components/leads/columns.js';

export const STUDENT_STATUS = { active: 'Активен', paused: 'Заморожен', trial: 'Пробный', left: 'Ушёл' };

/**
 * Где человек живёт в системе и куда вести по клику: лид (стадия воронки, кроме
 * «Оплачено») — на доску «Заявки», к его карточке (рамка, раскрываются группы).
 * «Оплачено» — уже ученик, ему страница ученика; лид, которого нет на доске (скрыт
 * крестиком или чужой у оператора без права видеть всех), — тоже на страницу.
 * @param {Object} s документ students
 * @param {boolean} canSeeAllLeads
 * @param {string} [uid]
 * @returns {{path: string, place: string}}
 */
export function locateLead(s, canSeeAllLeads, uid) {
  const column = COLUMNS.find((c) => c.key === s.funnelStage);
  if (column && column.key !== 'won') {
    if (s.boardHiddenAt) return { path: `/students/${s.id}`, place: 'Заявки · скрыта с доски' };
    if (!canSeeAllLeads && s.assignedOperator !== uid) return { path: `/students/${s.id}`, place: `Заявки · ${column.label} · у другого оператора` };
    return { path: `/leads?highlight=${s.id}&t=${Date.now()}`, place: `Заявки · ${column.label}` };
  }
  return { path: `/students/${s.id}`, place: `Студенты · ${STUDENT_STATUS[s.status] ?? 'ученик'}` };
}
