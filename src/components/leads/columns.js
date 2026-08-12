// src/components/leads/columns.js
/**
 * Единая модель 6 колонок kanban-доски «Заявки». Первые 4 — `leadStage`
 * (лид ещё не отработан), последние 2 — `leadResult` (лид на пробном уроке
 * с исходом). Порядок — порядок колонок слева направо на доске.
 */
export const COLUMNS = [
  { key: 'today', label: 'Сегодня' },
  { key: 'tomorrow', label: 'Следующий день' },
  { key: 'next_week', label: 'На следующей неделе' },
  { key: 'later', label: 'В будущем' },
  { key: 'came', label: 'Пришли' },
  { key: 'not_came', label: 'Не пришли' },
];

export const STAGE_KEYS = COLUMNS.slice(0, 4).map((c) => c.key);

/**
 * Колонка, в которой сейчас находится лид. Лид без `leadResult` живёт по
 * `leadStage` (дефолт 'today', если поле пустое или содержит не наше
 * значение); лид с `leadResult` — во второй паре колонок, `leadStage`
 * игнорируется (та же логика, что в исходном `byStage`/`byResult` до
 * объединения в одну доску).
 * @param {Object} lead
 * @returns {string} один из ключей COLUMNS
 */
export function columnKeyOf(lead) {
  if (lead.leadResult === 'came' || lead.leadResult === 'not_came') return lead.leadResult;
  return STAGE_KEYS.includes(lead.leadStage) ? lead.leadStage : 'today';
}
