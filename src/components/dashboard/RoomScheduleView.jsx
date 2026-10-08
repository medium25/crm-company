import { useEffect, useRef, useState } from 'react';
import { CalendarClock, EllipsisVertical, Minus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { BackButton } from '../ui/BackButton.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { FilterChip } from '../ui/FilterChip.jsx';
import { SectionTitle } from '../ui/SectionTitle.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import {
  MAX_CAPACITY,
  MIN_CAPACITY,
  clampCapacity,
  fillTone,
  groupCapacity,
  roomHueIndex,
  seatStates,
  teacherColorIndex,
  teacherStats,
  timeToMinutes,
} from '../../lib/roomSchedule.js';

const DAY_TYPE_TABS = [
  { value: 'odd', label: 'Нечётные дни' },
  { value: 'even', label: 'Чётные дни' },
];

// Времена начала занятий по умолчанию — те же, что у записи на пробный (settings.trialTimeSlots).
export const DEFAULT_ROOM_TIME_SLOTS = ['09:00', '10:30', '14:00', '15:30', '17:00', '18:30', '20:00'];

const TONE_CLASS = { ok: 'text-success', mid: 'text-warning', full: 'text-burgundy' };

const SEAT_CLASS = {
  full: 'border-success bg-success',
  trial: 'border-trial bg-trial',
  over: 'border-burgundy bg-burgundy',
  free: 'border-border-strong bg-surface',
};

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40';

/** Цвет учителя: один из 7 цветов графиков, номер стабилен по ключу учителя (teacherColorIndex). */
function teacherColor(key) {
  const k = teacherColorIndex(key);
  return { solid: `rgb(var(--color-chart-${k}))`, soft: `rgb(var(--color-chart-${k}) / 0.2)` };
}

/** Оттенок кабинета (chart-K по порядку в списке) кладётся в --hue на карточку. */
function hueOf(roomIndex) {
  return `rgb(var(--color-chart-${roomHueIndex(roomIndex)}))`;
}
/** Пастель оттенка: смесь с фоном карточек, поэтому в тёмной теме тоже читается. */
const mixSurface = (pct) => `color-mix(in srgb, var(--hue) ${pct}%, rgb(var(--color-surface)))`;
const HUE_TITLE = 'color-mix(in srgb, var(--hue) 60%, rgb(var(--color-text)))';

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

function startOf(g) {
  return g.schedule?.time ? timeToMinutes(g.schedule.time) : Infinity;
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
  // restoreFocus: вернуть фокус на кнопку «⋮». При потере фокуса из-за клика в другое
  // место (relatedTarget) фокус не трогаем, чтобы не отбирать его у нажатого элемента.
  const finish = (value, save, restoreFocus) => {
    if (done.current) return;
    done.current = true;
    const name = (value ?? '').trim();
    if (save && name && name !== initial) onSave(name, restoreFocus);
    else onCancel(restoreFocus);
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      maxLength={24}
      aria-label="Название кабинета"
      onFocus={(e) => e.target.select()}
      onBlur={(e) => finish(e.target.value, true, !e.relatedTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(e.currentTarget.value, true, true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish(null, false, true);
        }
      }}
      className="h-8 w-full min-w-0 rounded-field border border-navy bg-surface px-2 text-small font-bold text-text outline-none ring-2 ring-navy/20"
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
        <Seat state="trial" /> записан на пробный
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
 * Каждый кабинет это пастельная карточка своего оттенка с его занятиями по возрастанию времени.
 * Внутреннее состояние только UI: какой кабинет переименовывается, у какого открыто меню «⋮»,
 * какая группа правит вместимость, выбранный учитель.
 *
 * @param {Object} props
 * @param {{id: string, name: string}[]} props.rooms уже по порядку
 * @param {{id: string, code: string, courseName: string, teacherId?: string, teacherName: string,
 *   studentsCount?: number, capacity?: number, roomId: string, schedule: {time: string, type?: string}}[]} props.groups
 *   уже отфильтрованы по типу дней
 * @param {'even'|'odd'} props.dayType
 * @param {(value: string) => void} props.onDayTypeChange
 * @param {(roomId: string, name: string) => void} [props.onRenameRoom]
 * @param {(groupId: string, capacity: number) => void} [props.onChangeCapacity]
 * @param {() => void} [props.onAddRoom]
 * @param {() => void} [props.onRemoveLastRoom] кнопка «−» вверху
 * @param {(roomId: string) => void} [props.onRemoveRoom] пункт «Убрать кабинет» в меню карточки
 *   (без него пункта нет)
 * @param {(groupId: string) => void} [props.onOpenGroup]
 * @param {Record<string, number>} [props.trialCounts] записанных на пробный по группам (по умолчанию {})
 * @param {string} [props.notice] предупреждение над карточками
 * @param {boolean} [props.loading]
 * @param {boolean} [props.canEdit] без прав скрываются меню, карандаши и кнопки (по умолчанию true)
 * @param {string[]} [props.timeSlots] все времена начала занятий; в карточке кабинета показываются
 *   все, а время без группы подписано «можно открыть группу» (по умолчанию DEFAULT_ROOM_TIME_SLOTS)
 * @param {() => void} [props.onBack] если задан, вместо переключателя дней показывается «← К выбору дней»
 *   и название выбранных дней (выбор дней делается на стартовом экране)
 * @param {string} [props.title] заголовок блока (по умолчанию «Расписание кабинетов»)
 * @param {string} [props.hint] приглушённая подпись рядом с заголовком
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
  onRemoveRoom,
  onOpenGroup,
  trialCounts = {},
  notice,
  loading = false,
  canEdit = true,
  title = 'Расписание кабинетов',
  hint,
  timeSlots = DEFAULT_ROOM_TIME_SLOTS,
  onBack,
}) {
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [menuRoomId, setMenuRoomId] = useState(null);
  const [capGroupId, setCapGroupId] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [prevDayType, setPrevDayType] = useState(dayType);

  // Сброс правок: смена типа дней, загрузка, потеря прав, исчезнувший кабинет или группа.
  // Состояние поправляется прямо в рендере (без лишнего кадра со «старым» редактором).
  if (prevDayType !== dayType) {
    setPrevDayType(dayType);
    if (editingRoomId !== null) setEditingRoomId(null);
    if (capGroupId !== null) setCapGroupId(null);
  } else {
    if (editingRoomId !== null && (loading || !canEdit || !rooms.some((r) => r.id === editingRoomId))) {
      setEditingRoomId(null);
    }
    if (menuRoomId !== null && (loading || !canEdit || !rooms.some((r) => r.id === menuRoomId))) {
      setMenuRoomId(null);
    }
    if (capGroupId !== null && (loading || !canEdit || !groups.some((g) => g.id === capGroupId))) {
      setCapGroupId(null);
    }
  }

  // Возврат фокуса: ключ элемента [data-focus] в корне блока, куда фокус надо вернуть.
  const rootRef = useRef(null);
  const pendingFocus = useRef(null);
  // Какая из кнопок «−»/«+» вместимости нажата последней (на случай, если она станет disabled).
  const capButton = useRef(null);
  // Кабинет, который убрали через меню: когда его карточка исчезнет, фокус уходит на «Добавить кабинет».
  const removedRoom = useRef(null);
  const findFocusable = (key) => rootRef.current?.querySelector(`[data-focus="${CSS.escape(key)}"]`) ?? null;
  const restoreFocusTo = (key) => {
    pendingFocus.current = key;
  };

  useEffect(() => {
    if (pendingFocus.current) {
      const el = findFocusable(pendingFocus.current);
      pendingFocus.current = null;
      el?.focus();
    }
    if (removedRoom.current) {
      const kebab = findFocusable(`kebab:${removedRoom.current}`);
      if (!kebab) {
        removedRoom.current = null;
        if (!rootRef.current?.contains(document.activeElement)) {
          (findFocusable('addroom') ?? findFocusable('addroom-top'))?.focus();
        }
      } else if (document.activeElement !== kebab && document.activeElement !== document.body) {
        removedRoom.current = null; // убрать не получилось, фокус ушёл дальше
      }
    }
    if (capButton.current) {
      const el = findFocusable(capButton.current);
      if (!el) {
        capButton.current = null;
      } else if (el.disabled && (document.activeElement === el || document.activeElement === document.body)) {
        // Кнопка упёрлась в границу и стала недоступной: фокус уходит на соседнюю кнопку.
        const other = capButton.current.startsWith('capdec:')
          ? capButton.current.replace('capdec:', 'capinc:')
          : capButton.current.replace('capinc:', 'capdec:');
        capButton.current = other;
        findFocusable(other)?.focus();
      }
    }
  });

  // Меню «⋮»: клик снаружи закрывает, Escape закрывает и возвращает фокус на кнопку «⋮»,
  // при открытии фокус уходит на первый пункт.
  useEffect(() => {
    if (menuRoomId === null) return undefined;
    rootRef.current?.querySelector('[role="menu"] [role="menuitem"]')?.focus();
    const onPointerDown = (e) => {
      if (!e.target.closest?.('[data-room-menu]')) setMenuRoomId(null);
    };
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      restoreFocusTo(`kebab:${menuRoomId}`);
      setMenuRoomId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuRoomId]);

  const onMenuKeyDown = (e) => {
    const items = [...e.currentTarget.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Tab') {
      // Выход из меню по Tab: закрыть и вернуть фокус на «⋮», дальше фокус идёт как обычно.
      restoreFocusTo(`kebab:${menuRoomId}`);
      setMenuRoomId(null);
      return;
    }
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };

  const stats = teacherStats(groups);
  const colorByKey = new Map(stats.map((t) => [t.key, teacherColor(t.key)]));
  const selected = stats.find((t) => t.key === selectedKey) ?? null;
  const roomIndexById = new Map(rooms.map((r, i) => [r.id, i]));
  const roomNameById = new Map(rooms.map((r) => [r.id, r.name]));
  const toggleTeacher = (key) => setSelectedKey((cur) => (cur === key ? null : key));
  const startRename = (roomId) => {
    setMenuRoomId(null);
    setEditingRoomId(roomId);
  };

  function renderGroup(g) {
    const students = studentsOf(g);
    const capacity = groupCapacity(g);
    const trials = Math.max(0, trialCounts[g.id] ?? 0);
    const key = teacherKey(g);
    const dim = selected && selected.key !== key;
    const editingCap = canEdit && capGroupId === g.id;
    const trialsNote = trials > 0 ? `, на пробный записано ${trials}` : '';
    const countTitle = `Занято ${students} из ${capacity}${trialsNote}${canEdit ? '. Нажмите, чтобы изменить вместимость' : ''}`;
    const count = (
      <>
        {students}/{capacity}
        {canEdit && <Pencil className="h-3 w-3 text-muted" aria-hidden="true" />}
      </>
    );
    const countClass = `inline-flex shrink-0 items-center gap-1 rounded-badge px-2 py-0.5 text-small font-bold ${TONE_CLASS[fillTone(students, capacity, trials)]}`;

    return (
      <div key={g.id} className={`flex flex-col transition-opacity ${dim ? 'opacity-30' : ''}`}>
        <div className="flex min-h-[4.5rem] flex-1 items-stretch overflow-hidden rounded-row border border-border-strong bg-surface">
          <div
            className="flex w-16 shrink-0 flex-col items-center justify-center py-2 text-white"
            style={{ backgroundColor: 'var(--hue)' }}
          >
            <span className="text-title font-bold tabular-nums">{g.schedule?.time}</span>
            <span className="text-caption text-white/80">начало</span>
          </div>
          <div className="min-w-0 flex-1 px-2.5 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <button
                type="button"
                onClick={() => onOpenGroup?.(g.id)}
                title={`${g.code} · ${g.courseName} · ${g.teacherName}`}
                className={`max-w-full min-w-0 truncate rounded-field text-left text-small font-bold text-navy hover:underline ${FOCUS}`}
              >
                {g.code} <span className="font-semibold text-muted">· {g.courseName}</span>
              </button>
              <span className="flex shrink-0 items-center gap-1">
                {canEdit ? (
                  <button
                    type="button"
                    data-focus={`cap:${g.id}`}
                    onClick={() => {
                      capButton.current = null;
                      setCapGroupId(editingCap ? null : g.id);
                    }}
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
              </span>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              <div
                role="img"
                aria-label={`Занято ${students} из ${capacity} мест${trialsNote}`}
                className="flex min-w-0 max-w-full flex-wrap gap-[3px]"
              >
                {seatStates(students, capacity, trials).map((state, i) => (
                  <Seat key={i} state={state} />
                ))}
              </div>
              <button
                type="button"
                onClick={() => toggleTeacher(key)}
                aria-pressed={selected?.key === key}
                title={`${g.teacherName}: подсветить занятия учителя`}
                className={`max-w-full min-w-0 self-start truncate rounded-field text-caption text-muted hover:text-navy hover:underline ${FOCUS}`}
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
              data-focus={`capdec:${g.id}`}
              disabled={capacity <= MIN_CAPACITY}
              onClick={() => {
                capButton.current = `capdec:${g.id}`;
                onChangeCapacity?.(g.id, clampCapacity(capacity - 1));
              }}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-surface text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              <Minus className="h-3 w-3" aria-hidden="true" />
            </button>
            <b className="min-w-[1.25rem] text-center text-small text-text">{capacity}</b>
            <button
              type="button"
              aria-label="Увеличить вместимость"
              data-focus={`capinc:${g.id}`}
              disabled={capacity >= MAX_CAPACITY}
              onClick={() => {
                capButton.current = `capinc:${g.id}`;
                onChangeCapacity?.(g.id, clampCapacity(capacity + 1));
              }}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-surface text-text hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                capButton.current = null;
                restoreFocusTo(`cap:${g.id}`);
                setCapGroupId(null);
              }}
              className={`rounded-badge px-2 text-caption font-bold text-navy hover:bg-navy/10 ${FOCUS}`}
            >
              Готово
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderRoomTitle(room) {
    if (editingRoomId === room.id) {
      return (
        <RoomNameEditor
          initial={room.name}
          onSave={(name, restoreFocus) => {
            onRenameRoom?.(room.id, name);
            if (restoreFocus) restoreFocusTo(`kebab:${room.id}`);
            setEditingRoomId(null);
          }}
          onCancel={(restoreFocus) => {
            if (restoreFocus) restoreFocusTo(`kebab:${room.id}`);
            setEditingRoomId(null);
          }}
        />
      );
    }
    const text = `Кабинет ${room.name}`;
    const titleClass = 'min-w-0 truncate text-left text-title font-bold';
    if (!canEdit) {
      return (
        <span className={titleClass} style={{ color: HUE_TITLE }}>
          {text}
        </span>
      );
    }
    return (
      <button
        type="button"
        onClick={() => startRename(room.id)}
        title="Переименовать кабинет"
        className={`${titleClass} rounded-field hover:underline ${FOCUS}`}
        style={{ color: HUE_TITLE }}
      >
        {text}
      </button>
    );
  }

  function renderKebab(room) {
    const open = menuRoomId === room.id;
    return (
      <div data-room-menu className="absolute right-2 top-2.5">
        <button
          type="button"
          data-focus={`kebab:${room.id}`}
          aria-label={`Меню кабинета ${room.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setMenuRoomId(open ? null : room.id)}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-field text-muted hover:bg-surface/60 ${FOCUS}`}
        >
          <EllipsisVertical className="h-5 w-5" aria-hidden="true" />
        </button>
        {open && (
          <div
            role="menu"
            aria-label={`Кабинет ${room.name}`}
            onKeyDown={onMenuKeyDown}
            className="absolute right-0 top-8 z-10 min-w-[170px] rounded-row border border-border-strong bg-surface p-1 shadow-hover"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => startRename(room.id)}
              className={`flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-small font-semibold text-text hover:bg-chip ${FOCUS}`}
            >
              <Pencil className="h-4 w-4 text-muted" aria-hidden="true" />
              Переименовать
            </button>
            {onRemoveRoom && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  removedRoom.current = room.id;
                  restoreFocusTo(`kebab:${room.id}`);
                  setMenuRoomId(null);
                  onRemoveRoom(room.id);
                }}
                className={`flex w-full items-center gap-2 rounded-field px-2.5 py-2 text-left text-small font-semibold text-danger hover:bg-chip ${FOCUS}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Убрать кабинет
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // Время без группы в этом кабинете — свободный лот: показываем, что тут можно открыть группу.
  function renderFreeSlot(time) {
    return (
      <div
        key={`free:${time}`}
        className="flex min-h-[4.5rem] items-stretch overflow-hidden rounded-row border border-dashed border-border-strong"
      >
        <div
          className="flex w-16 shrink-0 flex-col items-center justify-center py-2"
          style={{ backgroundColor: mixSurface(28), color: HUE_TITLE }}
        >
          <span className="text-title font-bold tabular-nums">{time}</span>
          <span className="text-caption opacity-80">начало</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center px-2.5 py-1.5">
          <span className="text-small font-bold text-text">Свободно</span>
          <span className="text-caption text-muted">Можно открыть группу</span>
        </div>
      </div>
    );
  }

  function renderRoomCard(room, index) {
    const roomGroups = groups
      .filter((g) => g.roomId === room.id)
      .sort((a, b) => startOf(a) - startOf(b));
    // Все времена дня: стандартные + время любой уже стоящей группы (нестандартное тоже видно).
    const slotTimes = [...new Set([...timeSlots, ...roomGroups.map((g) => g.schedule?.time).filter(Boolean)])].sort(
      (a, b) => timeToMinutes(a) - timeToMinutes(b),
    );
    return (
      <section
        key={room.id}
        aria-label={`Кабинет ${room.name}`}
        className="relative flex flex-col rounded-card border-[1.5px] px-4 py-3.5"
        style={{ '--hue': hueOf(index), backgroundColor: mixSurface(14), borderColor: mixSurface(38) }}
      >
        <div className="flex min-h-8 items-center pr-9">{renderRoomTitle(room)}</div>
        {canEdit && renderKebab(room)}
        <div className="mt-3 grid auto-rows-fr gap-2">
          {slotTimes.length === 0 ? (
            <p className="px-0.5 text-small text-muted">Занятий нет</p>
          ) : (
            slotTimes.map((time) => {
              const atTime = roomGroups.filter((g) => g.schedule?.time === time);
              return atTime.length > 0 ? atTime.map(renderGroup) : renderFreeSlot(time);
            })
          )}
        </div>
      </section>
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
              <span className="inline-flex items-center gap-1 font-semibold text-text">
                {roomIndexById.has(g.roomId) && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0"
                    style={{ borderRadius: 3, backgroundColor: hueOf(roomIndexById.get(g.roomId)) }}
                    aria-hidden="true"
                  />
                )}
                каб. {roomNameById.get(g.roomId) ?? '?'}
              </span>
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

  const GRID = 'grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 lg:grid-cols-3';

  let body;
  if (loading) {
    body = (
      <div className={GRID}>
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (rooms.length === 0) {
    body = <EmptyState icon={CalendarClock} title="Кабинеты не заведены" />;
  } else {
    body = (
      <div className={GRID}>
        {rooms.map(renderRoomCard)}
        {canEdit && onAddRoom && (
          <button
            type="button"
            data-focus="addroom"
            onClick={() => onAddRoom()}
            className={`flex min-h-[7rem] flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-border-strong text-body font-bold text-muted hover:bg-chip ${FOCUS}`}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            Добавить кабинет
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <SectionTitle title={title} hint={hint} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {onBack ? (
          <>
            <BackButton onClick={onBack}>К выбору дней</BackButton>
            <span className="text-control font-bold text-text">{DAY_TYPE_TABS.find((t) => t.value === dayType)?.label}</span>
          </>
        ) : (
          DAY_TYPE_TABS.map((t) => (
            <FilterChip
              key={t.value}
              active={dayType === t.value}
              onClick={() => onDayTypeChange?.(t.value)}
              disabled={loading}
              className={`${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {t.label}
            </FilterChip>
          ))
        )}
      </div>

      <Legend />

      {notice && (
        <p role="status" className="mb-3 text-small font-bold text-warning">
          {notice}
        </p>
      )}

      {!loading && renderSummary()}

      {body}
    </div>
  );
}
