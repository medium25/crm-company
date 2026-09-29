/**
 * KPI-карточка дашборда. Иконка → подпись (до 2 строк) → число.
 * @param {Object} props
 * @param {import('react').ComponentType} props.icon
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {() => void} [props.onClick]
 */
export function StatCard({ icon: Icon, label, value, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full flex-col items-center rounded-card border border-border bg-surface p-6 text-center shadow-soft transition-shadow ${
        onClick ? 'cursor-pointer hover:shadow-hover' : ''
      }`}
    >
      <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full hover:bg-orange-soft">
        <Icon className="h-8 w-8 text-orange" />
      </span>
      <span className="mb-1 flex h-9 items-center text-body text-muted">{label}</span>
      <span className="text-kpi text-navy-num">{value}</span>
    </Tag>
  );
}
