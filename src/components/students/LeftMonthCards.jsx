import { pluralize } from '../../lib/format.js';

/**
 * Карточки месяцев внутри «Архива всех покинувших»: пастельная карточка цвета месяца с названием,
 * числом покинувших и полосой — доля месяца от самого «людного». Клик открывает список этого месяца.
 * @param {Object} props
 * @param {{key: string, label: string, count: number}[]} props.months от нового месяца к старому
 * @param {(key: string) => void} props.onPick
 */
export function LeftMonthCards({ months, onPick }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      {months.map((m, i) => {
        const hue = `rgb(var(--color-chart-${(i % 7) + 1}))`;
        const mix = (pct) => `color-mix(in srgb, ${hue} ${pct}%, rgb(var(--color-surface)))`;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onPick(m.key)}
            className="flex min-h-[8.5rem] flex-col rounded-card border-[1.5px] px-4 py-3.5 text-left transition hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
            style={{ backgroundColor: mix(14), borderColor: mix(38) }}
          >
            <span className="text-title font-bold" style={{ color: `color-mix(in srgb, ${hue} 60%, rgb(var(--color-text)))` }}>
              {m.label}
            </span>
            <span className="mt-0.5 text-body text-muted">
              {m.count} {pluralize(m.count, ['покинувший', 'покинувших', 'покинувших'])}
            </span>
            <span className="mt-auto block h-2 rounded-badge" style={{ backgroundColor: mix(22) }} aria-hidden="true">
              <span className="block h-full rounded-badge" style={{ width: `${Math.round((m.count / max) * 100)}%`, backgroundColor: hue }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
