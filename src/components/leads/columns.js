// src/components/leads/columns.js
/**
 * 7 стадий воронки продаж (2026-08-13-leads-funnel-redesign.md). Порядок —
 * порядок колонок слева направо на доске «Заявки» и порядок разрешённых
 * переходов вперёд (нельзя двигать карточку назад по списку).
 */
export const COLUMNS = [
  { key: 'new', label: 'Новый лид' },
  { key: 'calling', label: 'Дозвон' },
  { key: 'trial_scheduled', label: 'Пробный назначен' },
  { key: 'trial_completed', label: 'Пробный проведён' },
  { key: 'closing', label: 'Дожим' },
  { key: 'won', label: 'Оплачено' },
  { key: 'lost', label: 'Отказ' },
];

const FORWARD_ORDER = COLUMNS.filter((c) => c.key !== 'lost').map((c) => c.key);

/**
 * Стадия, в которой сейчас находится лид. Дефолт 'new' — для лидов без
 * funnelStage (до миграции, см. scripts/backfill-funnel-stage.mjs) и для
 * newly-created документов до записи поля.
 * @param {Object} lead
 * @returns {string} один из ключей COLUMNS
 */
export function columnKeyOf(lead) {
  return COLUMNS.some((c) => c.key === lead.funnelStage) ? lead.funnelStage : 'new';
}

/**
 * Разрешён ли переход `from → to`: только вперёд по FORWARD_ORDER (можно
 * пропускать стадии), либо в 'lost' из любой нетерминальной стадии.
 * 'won'/'lost' — терминальные, из них переходов нет вовсе.
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
export function isForwardAllowed(from, to) {
  if (from === 'won' || from === 'lost') return false;
  if (to === 'lost') return true;
  const fromIndex = FORWARD_ORDER.indexOf(from);
  const toIndex = FORWARD_ORDER.indexOf(to);
  return toIndex > fromIndex;
}
