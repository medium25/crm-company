import { useRef, useState } from 'react';
import { CalendarClock, Minus, Pencil, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { FilterChip } from '../ui/FilterChip.jsx';
import { SectionTitle } from '../ui/SectionTitle.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import {
  MAX_CAPACITY,
  MIN_CAPACITY,
  ROOMS_PER_ROW,
  blockTimes,
  chunkRooms,
  clampCapacity,
  fillTone,
  groupCapacity,
  seatStates,
  teacherStats,
} from '../../lib/roomSchedule.js';

const DAY_TYPE_TABS = [
  { value: 'even', label: 'Чётные дни' },
  { value: 'odd', label: 'Нечётные дни' },
  { value: 'weekdays', label: 'По дням недели' },
];

const TONE_CLASS = { ok: 'text-success', mid: 'text-warning', full: 'text-danger' };

const SEAT_CLASS = {
  full: 'border-navy bg-navy',
  over: 'border-danger bg-danger',
  free: 'border-border-strong bg-surface',
};

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40';

/** Цвет учителя: один из 7 цветов графиков по кругу. */
function teacherColor(index) {
  const k = (index % 7) + 1;
  return { solid: `rgb(var(--color-chart-${k}))`, soft: `rgb(var(--color-chart-${k}) / 0.2)` };
}

function teacherKey(g) {
  return g.teacherId ?? g.teacherName ?? '';
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

function studentsOf(g) {
  const n = Number(g.studentsCount);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function Seat({ state }) {
  return (
    <span
      className={`inline-block h-[13px] w-[13px] border-[1.5px] ${SEAT_CLASS[state]}`}
      style={{ borderRadius: 4 }}
    />
  );
}

/** Поле переименования кабинета. Сохраняет ровно один раз (Enter и потеря фокуса не дублируются). */
function RoomNameEditor({ initial, onSave, onCancel }) {
  const done = useRef(false);
  const finish = (value, save) => {
    if (done.current) return;
    done.current = true;
    const name = (value ?? '').trim();
    if (save && name && name !== initial) onSave(name);
    else onCancel();
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={24}
      aria-label="Название кабинета"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => finish(e.target.value, true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(e.currentTarget.value, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null, false);
        }
      }}
      className="h-8 w-36 max-w-full rounded-field border border-navy bg-surface px-2 text-small font-bold text-text outline-none ring-2 ring-navy/20"
    />
  );
}

function Legend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-row bg-chip px-3 py-2 text-caption text-muted">
      <span className="inline-flex items-center gap-1.5">
        <Seat state="full" /> занято (ученик)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Seat state="free" /> свободно
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Seat state="over" /> больше, чем мест
      </span>
      <span>6/8 = 6 учеников из 8 мест</span>
    </div>
  );
}

/**
 * Расписание кабинетов: чистое представление. Данные и действия приходят пропсами,
 * в Firestore и роутер компонент не ходит (переход в группу — через onOpenGroup).
 * Внутреннее состояние только UI: какой кабинет переименовывается, какая группа правит
 * вместимость, выбранный учитель.
 *
 * @param {Object} props
 * @param {{id: string, name: string}[]} props.rooms уже по порядку
 * @param {{id: string, code: string, courseName: string, teacherId?: string, teacherName: string,
 *   studentsCount?: number, capacity?: number, roomId: string, schedule: {time: string}}[]} props.groups
 *   уже отфильтрованы по типу дней
 * @param {'even'|'odd'|'weekdays'} props.dayType
 * @param {(value: string) => void} props.onDayTypeChange
 * @param {(roomId: string, name: string) => void} [props.onRenameRoom]
 * @param {(groupId: string, capacity: number) => void} [props.onChangeCapacity]
 * @param {() => void} [props.onAddRoom]
 * @param {() => void} [props.onRemoveLastRoom]
 * @param {(groupId: string) => void} [props.onOpenGroup]
 * @param {string} [props.notice] предупреждение над таблицей
 * @param {boolean} [props.loading]
 * @param {boolean} [props.canEdit] без прав скрываются карандаши и кнопки (по умолчанию true)
 */
export function RoomScheduleView({
  rooms,
  groups,
  dayType,
  onDayTypeChange,
  onRenameRoom,
  onChangeCapacity,
  onAddRoom,
  onRemoveLastRoom,
  onOpenGroup,
  notice,
  loading = false,
  canEdit = true,
}) {
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [capGroupId, setCapGroupId] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);

  const stats = teacherStats(groups);
  const colorByKey = new Map(stats.map((t, i) => [t.key, teacherColor(i)]));
  const selected = stats.find((t) => t.key === selectedKey) ?? null;
  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
  const toggleTeacher = (key) => setSelectedKey((cur) => (cur === key ? null : key));

  function renderGroup(g) {
    const students = studentsOf(g);
    const capacity = groupCapacity(g);
    const key = teacherKey(g);
    const dim = selected && selected.key !== key;
    const editingCap = canEdit && capGroupId === g.id;
    const countTitle = `Занято ${students} из ${capacity}${canEdit ? '. Нажмите, чтобы изменить вместимость' : ''}`;
    const count = (
      <>
        {students}/{capacity}
        {canEdit && <Pencil className="h-3 w-3 text-muted" aria-hidden="true" />}
      </>
    );
    const countClass = `inline-flex shrink-0 items-center gap-1 rounded-badge px-2 py-0.5 text-small font-bold ${TONE_CLASS[fillTone(students, capacity)]}`;

    return (
      <div key={g.id} className={`transition-opacity ${dim ? 'opacity-30' : ''}`}>
        <div className="flex items-stretch overflow-hidden rounded-row border border-border-strong bg-chip">
          <div className="flex w-16 shrink-0 flex-col items-center justify-center bg-navy py-2 text-white">
            <span className="text-title font-bold tabular-nums">{g.schedule?.time}</span>
            <span className="text-caption text-white/80">начало</span>
          </div>
          <div className="min-w-0 flex-1 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onOpenGroup?.(g.id)}
                title={`${g.code} · ${g.courseName} · ${g.teacherName}`}
                className={`min-w-0 truncate rounded-field text-left text-small font-bold text-navy hover:underline ${FOCUS}`}
              >
                {g.code} <span className="font-semibold text-muted">· {g.courseName}</span>
              </button>
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setCapGroupId(editingCap ? null : g.id)}
                  title={countTitle}
                  aria-label={`${countTitle}. Группа ${g.code}`}
                  aria-expanded={editingCap}
                  className={`${countClass} hover:bg-navy/10 ${FOCUS}`}
                >
                  {count}
                </button>
              ) : (
                <span title={countTitle} className={countClass}>
                  {count}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <div
                role="img"
                aria-label={`Занято ${students} из ${capacity} мест`}
                className="flex min-w-0 flex-wrap gap-[3px]"
              >
                {seatStates(students, capacity).map((state, i) => (
                  <Seat key={i} state={state} />
                ))}
              </div>
              <button
                type="button"
                onClick={() => toggleTeacher(key)}
                aria-pressed={selected?.key === key}
                title="Подсветить занятия учителя"
                className={`truncate rounded-field text-caption text-muted hover:text-navy hover:underline ${FOCUS}`}
              >
                {g.teacherName}
              </button>
            </div>
          </div>
        </div>
        {editingCap && (
          <div className="mt-1.5 flex items-center gap-2 text-caption text-muted">
            Вместимость группы
            <button
              type="button"
              aria-label="Уменьшить вместимость"
              disabled={capacity <= MIN_CAPACITY}
              onClick={() => onChangeCapacity?.(g.id, clampCapacity(capacity - 1))}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-surface text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
            <b className="min-w-[1.25rem] text-center text-small text-text">{capacity}</b>
            <button
              type="button"
              aria-label="Увеличить вместимость"
              disabled={capacity >= MAX_CAPACITY}
              onClick={() => onChangeCapacity?.(g.id, clampCapacity(capacity + 1))}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-surface text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setCapGroupId(null)}
              className={`rounded-badge px-2 text-caption font-bold text-navy hover:bg-navy/10 ${FOCUS}`}
            >
              Готово
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderRoomHead(room) {
    if (editingRoomId === room.id) {
      return (
        <RoomNameEditor
          initial={room.name}
          onSave={(name) => {
            onRenameRoom?.(room.id, name);
            setEditingRoomId(null);
          }}
          onCancel={() => setEditingRoomId(null)}
        />
      );
    }
    if (!canEdit) return <span>Кабинет {room.name}</span>;
    return (
      <button
        type="button"
        onClick={() => setEditingRoomId(room.id)}
        title="Переименовать кабинет"
        aria-label={`Переименовать кабинет ${room.name}`}
        className={`inline-flex items-center gap-1.5 rounded-field font-bold text-text hover:text-navy ${FOCUS}`}
      >
        Кабинет {room.name}
        <Pencil className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
      </button>
    );
  }

  function renderBlock(block, index) {
    const ids = block.map((r) => r.id);
    const times = blockTimes(groups, ids);
    const blockGroups = groups.filter((g) => ids.includes(g.roomId));
    return (
      <div key={index} className="mb-4 overflow-x-auto">
        <table className="w-full min-w-[840px] table-fixed border-collapse">
          <thead>
            <tr>
              {Array.from({ length: ROOMS_PER_ROW }, (_, i) => {
                const room = block[i];
                return (
                  <th
                    key={room?.id ?? `empty-${i}`}
                    className="h-10 border-b border-r border-border bg-surface-alt px-2.5 py-2 text-left text-body font-bold text-text last:border-r-0"
                  >
                    {room && renderRoomHead(room)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {times.length === 0 ? (
              <tr>
                <td colSpan={ROOMS_PER_ROW} className="p-6 text-center text-small text-muted">
                  В этих кабинетах пока нет групп
                </td>
              </tr>
            ) : (
              times.map((time) => (
                <tr key={time}>
                  {Array.from({ length: ROOMS_PER_ROW }, (_, i) => {
                    const room = block[i];
                    const cell = room
                      ? blockGroups.filter((g) => g.roomId === room.id && g.schedule?.time === time)
                      : [];
                    return (
                      <td
                        key={room?.id ?? `empty-${i}`}
                        className="border-b border-r border-border p-1.5 align-top last:border-r-0"
                      >
                        <div className="flex flex-col gap-1.5">{cell.map(renderGroup)}</div>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  function renderSummary() {
    if (!selected) return null;
    const color = colorByKey.get(selected.key);
    const n = selected.students;
    const m = selected.groups.length;
    return (
      <div
        className="mb-3 flex items-start justify-between gap-3 rounded-row border bg-surface px-3 py-2 text-small text-text"
        style={{ borderColor: color.solid }}
      >
        <p>
          <b>{selected.name}</b>: {n} {plural(n, 'ученик', 'ученика', 'учеников')} сейчас в {m}{' '}
          {plural(m, 'группе', 'группах', 'группах')}. Занятия:{' '}
          {selected.groups.map((g) => (
            <span
              key={g.id}
              className="mx-0.5 inline-flex items-center gap-1.5 rounded-badge bg-navy/10 px-2.5 py-0.5 font-bold text-navy"
            >
              {g.schedule?.time}
              <span className="font-semibold text-text">каб. {roomNameById.get(g.roomId) ?? '?'}</span>
            </span>
          ))}
        </p>
        <button
          type="button"
          aria-label="Сбросить выбор учителя"
          onClick={() => setSelectedKey(null)}
          className={`shrink-0 rounded-full p-1 text-muted hover:bg-surface-alt ${FOCUS}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  let body;
  if (loading) {
    body = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  } else if (rooms.length === 0) {
    body = <EmptyState icon={CalendarClock} title="Кабинеты не заведены" />;
  } else if (groups.length === 0) {
    body = <EmptyState icon={CalendarClock} title="Нет групп с таким типом расписания" />;
  } else {
    body = chunkRooms(rooms).map(renderBlock);
  }

  return (
    <div>
      <SectionTitle title="Расписание кабинетов" />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {DAY_TYPE_TABS.map((t) => (
          <FilterChip
            key={t.value}
            active={dayType === t.value}
            onClick={() => onDayTypeChange?.(t.value)}
            className={FOCUS}
          >
            {t.label}
          </FilterChip>
        ))}
        <div className="ml-auto flex items-center gap-2 text-small text-muted">
          Кабинетов
          {canEdit && (
            <Button
              variant="icon-round"
              size="sm"
              aria-label="Убрать последний кабинет"
              disabled={rooms.length === 0}
              onClick={() => onRemoveLastRoom?.()}
              className={FOCUS}
            >
              <Minus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <b className="min-w-[1.25rem] text-center text-control text-text">{rooms.length}</b>
          {canEdit && (
            <Button
              variant="icon-round"
              size="sm"
              aria-label="Добавить кабинет"
              onClick={() => onAddRoom?.()}
              className={FOCUS}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <Legend />

      {notice && (
        <p role="status" className="mb-3 text-small font-bold text-warning">
          {notice}
        </p>
      )}

      {!loading && stats.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {stats.map((t) => {
            const color = colorByKey.get(t.key);
            const active = selected?.key === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={active}
                onClick={() => toggleTeacher(t.key)}
                className={`inline-flex h-9 items-center gap-2 rounded-field border bg-surface px-3 text-small font-semibold text-text hover:bg-surface-alt ${FOCUS} ${
                  active ? '' : 'border-border-strong'
                }`}
                style={active ? { borderColor: color.solid, boxShadow: `0 0 0 2px ${color.soft}` } : undefined}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color.solid }} aria-hidden="true" />
                {t.name}
                <b className="font-bold">{t.students}</b> уч.
              </button>
            );
          })}
        </div>
      )}

      {!loading && renderSummary()}

      {body}
    </div>
  );
}
