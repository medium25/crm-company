import { ArrowRight } from 'lucide-react';
import { SectionTitle } from '../ui/SectionTitle.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { dayTypeSummary, roomHueIndex } from '../../lib/roomSchedule.js';

const CHOICES = [
  { type: 'even', title: 'Чётные дни', note: '2, 4, 6 … числа месяца' },
  { type: 'odd', title: 'Нечётные дни', note: '1, 3, 5 … числа месяца' },
];

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

/** Миниатюра сетки «время × кабинет»: цветная клетка — в кабинете в это время есть группа, серая — можно открыть. */
function MiniMap({ rooms, summary }) {
  return (
    <div
      role="img"
      aria-label={`Занятость кабинетов: ${summary.groups} групп, свободных времён ${summary.free}`}
      className="mt-3 grid items-center gap-[3px]"
      style={{ gridTemplateColumns: `2.5rem repeat(${rooms.length}, minmax(0, 1fr))` }}
    >
      <span />
      {rooms.map((r) => (
        <span key={r.id} className="truncate text-center text-caption text-muted">
          Каб. {r.name}
        </span>
      ))}
      {summary.times.map((time, ti) => (
        <div key={time} className="contents">
          <span className="text-caption tabular-nums text-muted">{time}</span>
          {summary.cells[ti].map((busy, ri) => (
            <i
              key={rooms[ri].id}
              className={`block h-3 rounded-field ${busy ? '' : 'bg-chip'}`}
              style={busy ? { backgroundColor: `rgb(var(--color-chart-${roomHueIndex(ri)}))` } : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Первый экран блока «Расписание кабинетов»: две большие карточки «Чётные дни» /
 * «Нечётные дни» с миниатюрой занятости. Клик открывает настоящее расписание этих дней.
 * @param {Object} props
 * @param {{id: string, name: string}[]} props.rooms
 * @param {Array<Object>} props.groups группы с кабинетом и временем (любого типа дней)
 * @param {string[]} props.timeSlots
 * @param {(type: 'even'|'odd') => void} props.onPick
 * @param {boolean} [props.loading]
 */
export function RoomDayTypeChooser({ rooms, groups, timeSlots, onPick, loading = false }) {
  return (
    <div>
      <SectionTitle title="Расписание кабинетов" hint="выберите дни — откроется расписание" />
      {loading ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {CHOICES.map((c) => {
            const s = dayTypeSummary(rooms, groups, timeSlots, c.type);
            return (
              <button
                key={c.type}
                type="button"
                onClick={() => onPick(c.type)}
                className="group relative rounded-card border-[1.5px] border-border-strong bg-card p-4 text-left transition hover:border-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              >
                <span className="absolute right-3.5 top-3.5 flex h-7 w-7 items-center justify-center rounded-full bg-navy text-white transition group-hover:bg-navy-hover">
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="block text-page font-bold text-text">{c.title}</span>
                <span className="block text-caption text-muted">{c.note}</span>
                <span className="mt-2 block text-small font-semibold text-text">
                  {s.groups} {plural(s.groups, 'группа', 'группы', 'групп')} ·{' '}
                  <span className="text-success">
                    {s.free} {plural(s.free, 'свободное время', 'свободных времени', 'свободных времён')}
                  </span>
                </span>
                {rooms.length > 0 && <MiniMap rooms={rooms} summary={s} />}
                <span className="mt-2 flex items-center gap-4 text-caption text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2.5 w-2.5 rounded-badge" style={{ backgroundColor: 'rgb(var(--color-chart-1))' }} aria-hidden="true" /> занято (цвет кабинета)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i className="inline-block h-2.5 w-2.5 rounded-badge bg-chip" aria-hidden="true" /> можно открыть
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
