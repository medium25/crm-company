import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { doc, updateDoc } from 'firebase/firestore';
import { CheckCircle2, XCircle, ArrowRight, PhoneOff, Info, ClipboardCheck, Users, X, Settings, ChevronUp, ChevronDown } from 'lucide-react';
import { db } from '../../firebase.js';
import { DropdownMenu } from '../ui/DropdownMenu.jsx';
import { Modal } from '../ui/Modal.jsx';
import { LeadFormDataModal } from './LeadFormDataModal.jsx';
import { COLUMNS, isForwardAllowed } from './columns.js';
import { isPriorityLead, isTrialDay, contactDueDate, stageDeadline, overdueReasonLabel, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { formatPhone, formatDateTime, formatDateTimeShort, formatRelativeDeadline, formatRelativeDay, formatOverdueBy, formatSource } from '../../lib/format.js';
import { DEFAULT_CHECKLIST_ITEMS, checklistCheckedCount, checklistPercent } from '../../lib/leadChecklist.js';

/**
 * Чек-лист первого разговора — раскрывается прямо в карточке, только в
 * «Новый лид»/«Дозвон». Отметки пишутся сразу в Firestore по каждому
 * клику — тот же самооптимистичный паттерн, что и остальные действия на
 * карточке (onMarkAttempt и т.п.), без промежуточного стейта. Сам список
 * пунктов (`items`, из settings/{branchId}.checklistItems — общий для
 * всех лидов филиала, не для этого одного) редактируется тут же через ⚙ —
 * добавить/удалить пункт, пишет `onEditItems` (editChecklistItems в
 * LeadsPage.jsx).
 */
function LeadChecklistPanel({ leadId, checklist, items, onEditItems }) {
  const [editing, setEditing] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [renamingKey, setRenamingKey] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const checked = checklistCheckedCount(checklist, items);
  const percent = checklistPercent(checklist, items);

  const removeItem = (key) => onEditItems?.(items.filter((i) => i.key !== key));

  const startRename = (item) => {
    setRenamingKey(item.key);
    setRenameDraft(item.label);
  };

  const saveRename = () => {
    const label = renameDraft.trim();
    if (label) onEditItems?.(items.map((i) => (i.key === renamingKey ? { ...i, label } : i)));
    setRenamingKey(null);
  };

  const moveItem = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onEditItems?.(next);
  };

  const addItem = () => {
    const label = newLabel.trim();
    if (!label) return;
    onEditItems?.([...items, { key: `item_${Date.now()}`, label }]);
    setNewLabel('');
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1 border-t border-border pt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold text-muted">
          Соблюдено: {checked}/{items.length} ({percent}%)
        </p>
        {onEditItems && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-label="Редактировать пункты чек-листа"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-surface-alt ${editing ? 'text-navy' : 'text-muted'}`}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {items.map((item, index) => (
        <div key={item.key} className="flex items-start gap-1.5">
          {editing ? (
            <>
              <div className="mt-0.5 flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0}
                  aria-label={`Переместить вверх: ${item.label}`}
                  className="flex h-3.5 w-3.5 items-center justify-center text-muted hover:text-navy disabled:opacity-20"
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => moveItem(index, 1)}
                  disabled={index === items.length - 1}
                  aria-label={`Переместить вниз: ${item.label}`}
                  className="flex h-3.5 w-3.5 items-center justify-center text-muted hover:text-navy disabled:opacity-20"
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
              <DropdownMenu
                items={[
                  { label: 'Переименовать', onClick: () => startRename(item) },
                  { label: 'Удалить', danger: true, onClick: () => removeItem(item.key) },
                ]}
                trigger={({ ref, toggle }) => (
                  <button
                    ref={ref}
                    type="button"
                    onClick={toggle}
                    aria-label={`Действия: ${item.label}`}
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted hover:text-navy"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                )}
              />
            </>
          ) : (
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              checked={Boolean(checklist?.[item.key])}
              onChange={(e) => updateDoc(doc(db, 'students', leadId), { [`checklist.${item.key}`]: e.target.checked })}
            />
          )}
          {renamingKey === item.key ? (
            <input
              autoFocus
              type="text"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveRename()}
              onBlur={saveRename}
              className="h-6 min-w-0 flex-1 rounded-field border border-navy bg-white px-1.5 text-[12px] text-text focus:outline-none"
            />
          ) : (
            <label className="cursor-pointer text-[12px] leading-tight text-text">{item.label}</label>
          )}
        </div>
      ))}
      {editing && (
        <div className="mt-1 flex items-center gap-1">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Новый пункт…"
            className="h-7 min-w-0 flex-1 rounded-field border border-border-strong bg-white px-2 text-[12px] text-text focus:border-navy focus:outline-none"
          />
          <button
            type="button"
            onClick={addItem}
            className="flex h-7 shrink-0 items-center justify-center rounded-field bg-navy px-2 text-[11px] font-bold text-white hover:bg-navy-hover"
          >
            Добавить
          </button>
        </div>
      )}
    </div>
  );
}

/** «Muslima Azizova» → «MA» — инициалы оператора для бейджа-квадрата, как в Telegram. */
export function operatorInitials(name) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts[1]?.[0] ?? '';
  return (first + last).toUpperCase();
}

/** «RUS TILI» → «Рус», «INGLIZ TILI» → «Англ» — короткая метка курса для карточки. */
function shortCourseLabel(courseName) {
  if (!courseName) return '';
  if (/rus/i.test(courseName)) return 'Рус';
  if (/ingliz|english/i.test(courseName)) return 'Англ';
  return courseName;
}

/** «Рус - Понедельник - 14:00» вместо голой даты — курс/день недели/время пробного. */
export function trialScheduleLabel(lead) {
  const trialDateJs = lead.trialDate?.toDate?.();
  if (!trialDateJs) return 'Дата не указана';
  const weekday = format(trialDateJs, 'EEEE', { locale: ru });
  const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const time = format(trialDateJs, 'HH:mm');
  const course = shortCourseLabel(lead.trialCourseName);
  return course ? `${course} - ${weekdayCap} - ${time}` : `${weekdayCap} - ${time}`;
}

// Значение по умолчанию; реальное берётся из настройки колонки «Пробный назначен» (⚙ → макс. касаний).
const UNREACHABLE_MAX_ATTEMPTS = 3;

/**
 * Главная кнопка следующего касания — под лентой истории, во всю ширину
 * карточки, сплошной синий (цвет системы (navy)), без иконки: единственное
 * реально кликабельное действие на этой стадии, должно выделяться, а не
 * теряться среди мелких строк истории. `over` — касаний уже больше рекомендуемого
 * максимума: кнопка остаётся, но бордовая, со счётом «N/M» (напр. 2/1).
 */
function TouchActionButton({ ref, onClick, ariaLabel, text, time, compact, over = false }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex flex-col items-center justify-center gap-0.5 rounded-field text-[13px] font-bold leading-tight text-white ${
        over ? 'bg-[#7B1E3A] hover:bg-[#661830]' : 'bg-navy hover:bg-navy-hover'
      } ${
        compact ? 'shrink-0 px-3 py-1.5' : 'w-1/2 py-1'
      }`}
    >
      <span className="whitespace-nowrap">{text}</span>
      {!compact && time && <span className="text-[10px] font-normal leading-tight opacity-80">{time}</span>}
    </button>
  );
}

// Идеальное время обработки — и новый лид, и задача (дедлайн, что стоял
// на лиде до этой отметки) должны быть обработаны за 30 минут с момента
// поступления/наступления.
const IDEAL_RESPONSE_MINUTES = 30;

function pluralHours(hours) {
  const mod10 = hours % 10;
  const mod100 = hours % 100;
  return mod10 === 1 && mod100 !== 11 ? 'час' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'часа' : 'часов';
}

function pluralMinutes(minutes) {
  const mod10 = minutes % 10;
  const mod100 = minutes % 100;
  return mod10 === 1 && mod100 !== 11 ? 'минуту' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'минуты' : 'минут';
}

function pluralDays(days) {
  const mod10 = days % 10;
  const mod100 = days % 100;
  return mod10 === 1 && mod100 !== 11 ? 'день' : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 'дня' : 'дней';
}

/**
 * Насколько быстро отреагировали на entry — относительно дедлайна, что
 * стоял на лиде ДО этой отметки (entry.expectedBy, записывается в момент
 * КАЖДОЙ отметки, см. LeadsPage.jsx buildAttempts/buildLog). Для самого
 * первого касания (expectedBy ещё нет — реагировать было не на что, кроме
 * самого факта прихода лида) отсчёт — от `fallbackAt` (момент создания
 * лида, см. buildTimelineNodes). null — если сравнивать вообще не с чем.
 * @returns {{tone: 'good'|'bad', label: string}|null}
 */
function responseTiming(entry, fallbackAt) {
  const expectedRaw = entry.expectedBy ?? fallbackAt;
  const expected = expectedRaw?.toDate ? expectedRaw.toDate() : expectedRaw;
  const at = entry.at?.toDate ? entry.at.toDate() : entry.at;
  if (!expected || !at) return null;
  const minutes = Math.round((at.getTime() - expected.getTime()) / 60000);
  if (minutes <= IDEAL_RESPONSE_MINUTES) {
    return { tone: 'good', label: minutes <= 0 ? 'Обработано вовремя' : `Обработано вовремя — за ${minutes} ${pluralMinutes(minutes)}` };
  }
  const hours = Math.round(minutes / 60);
  if (hours <= 0) return { tone: 'good', label: 'Обработано вовремя' };
  if (hours > 24) {
    const days = Math.round(hours / 24);
    return { tone: 'bad', label: `Опоздали на ${days} ${pluralDays(days)}` };
  }
  return { tone: 'bad', label: `Опоздали на ${hours} ${pluralHours(hours)}` };
}

function msOf(v) {
  if (!v) return 0;
  if (v.toDate) return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  return 0;
}

/**
 * Единая история лида — переходы между колонками (lead.stageHistory) +
 * все касания (callAttempts/closingTouchLog/unreachableAttempts), слитые
 * в одну ленту по времени. Раньше каждый трекер показывал только СВОЮ
 * историю (callAttempts — только в «Дозвоне» и т.п.) — при переводе в
 * другую колонку она визуально пропадала с карточки (данные никуда не
 * девались, просто нечем было их показать). Теперь одна лента видна на
 * любой стадии, переход между колонками — тоже запись в ней.
 * @param {Object} lead
 * @returns {Array<{type: 'stage'|'entry', stage?: string, at: Date, ...}>}
 */
function buildFullHistory(lead) {
  const items = [];
  (lead.stageHistory ?? []).forEach((h) => items.push({ type: 'stage', stage: h.stage, at: h.enteredAt }));
  (lead.callAttempts ?? []).forEach((e) => items.push({ type: 'entry', ...e }));
  (lead.closingTouchLog ?? []).forEach((e) => items.push({ type: 'entry', ...e }));
  (lead.unreachableAttempts ?? []).forEach((e) => items.push({ type: 'entry', ...e }));
  (lead.operatorTransfers ?? []).forEach((e) => items.push({ type: 'operator', fromName: e.fromName, toName: e.toName, at: e.at }));
  items.sort((a, b) => {
    const diff = msOf(a.at) - msOf(b.at);
    if (diff !== 0) return diff;
    // Тай-брейк на одинаковый at: касание, что вызвало автопереход стадии
    // (см. LeadsPage.jsx buildStageFields — тот же `at`, что у попытки),
    // должно идти ДО самого перехода — оно причина, переход следствие.
    if (a.type === 'entry' && b.type === 'stage') return -1;
    if (a.type === 'stage' && b.type === 'entry') return 1;
    return 0;
  });
  return items;
}

// Только реальные взаимодействия (касания) — переходы стадий/передачи
// оператору в ленту не попадают, это служебные события, не задачи.
// Каждый узел — пара «какая задача стояла» (task, мелким) + «что вышло →
// следующий шаг» (result, крупным): task — это nextStep ПРЕДЫДУЩЕГО касания (что решили
// сделать дальше тогда — это и есть задача, которую сейчас выполнили),
// у самого первого касания задачи в данных нет — это всегда стартовый SLA.
function buildTimelineNodes(history, pendingDueAt, currentStage) {
  const fallbackAt = history[0]?.at; // момент создания лида — см. responseTiming
  const interactions = history.filter((item) => item.type === 'entry');
  // Номер на кружке — сквозной по всей ленте (1, 2, 3 …), при переходе между
  // столбцами не начинается заново.
  const nodes = interactions.map((item, i) => {
    const timing = responseTiming(item, fallbackAt);
    // Крупная строка — «что произошло → следующий шаг» этого касания; мелкая —
    // какая задача стояла + вовремя ли её сделали. Старые записи без текста
    // показывают вместо строки только оценку срока.
    const line = [item.outcome, item.nextStep].filter(Boolean).join(' → ');
    const standingTask = i === 0 ? 'Позвонить в первые 30 минут' : (interactions[i - 1].nextStep ?? null);
    return {
      type: 'entry',
      task: [standingTask, line ? timing?.label : null].filter(Boolean).join(' · ') || null,
      result: line || timing?.label || 'Без задачи',
      at: item.at,
      step: i + 1,
    };
  });
  // Последняя поставленная задача (nextStep последнего касания) ещё не
  // отработана — отдельный выделенный узел в конце ленты, не такой же
  // серый пункт, как уже сделанные. Номер — следующий в сквозном счёте ленты.
  // До первого звонка своего nextStep ещё нет ни у кого — задача на этот
  // случай фиксированная, та же, что у самого первого касания (i === 0
  // выше), с дедлайном «через 30 минут после создания лида».
  const pendingTask =
    interactions.length === 0
      ? (currentStage === 'new' || currentStage === 'calling') && fallbackAt
        ? 'Позвонить в первые 30 минут'
        : null
      : interactions[interactions.length - 1].nextStep;
  const pendingDue =
    interactions.length === 0 && fallbackAt ? new Date(msOf(fallbackAt) + 30 * 60000) : (pendingDueAt ?? null);
  if (pendingTask) {
    nodes.push({ type: 'pending', task: pendingTask, dueAt: pendingDue, step: interactions.length + 1 });
  }
  return nodes;
}

/**
 * Прокручиваемая лента (см. buildFullHistory) — одна на карточку,
 * независимо от текущей стадии, фиксированной высоты (не растягивает
 * карточку числом записей). Рядом с ней (ниже, вне ленты) каждый трекер
 * рисует свой «следующий шаг» (CallAttemptDots/TouchDots/UnreachableBlock).
 */
export function HistoryTimeline({ lead }) {
  // useState/useRef/useEffect ДО early return — иначе при первом же
  // появлении истории (0 записей → 1) хуки в этом инстансе компонента
  // перестанут совпадать между рендерами (React бросит "Rendered fewer
  // hooks than expected").
  const [expanded, setExpanded] = useState(() => new Set());
  const [dateOpenAt, setDateOpenAt] = useState(null);
  const dateRef = useRef(null);
  const scrollRef = useRef(null);
  // Дедлайн ЕЩЁ не сделанной задачи — то же поле, что читает кнопка
  // касания под лентой на этой стадии (CallAttemptDots/TouchDots/
  // UnreachableBlock), просто показываем его тут же, рядом с текстом задачи.
  const stage = lead.funnelStage ?? 'new';
  const pendingDueAt =
    stage === 'closing' ? lead.nextTouchAt : stage === 'trial_scheduled' ? lead.unreachableNextCallDueAt : lead.nextCallDueAt;
  const nodes = buildTimelineNodes(buildFullHistory(lead), pendingDueAt, stage);

  useEffect(() => {
    if (dateOpenAt === null) return undefined;
    const onClickOutside = (e) => {
      if (dateRef.current && !dateRef.current.contains(e.target)) setDateOpenAt(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [dateOpenAt]);

  // Лента отсортирована по возрастанию (старое сверху, новое снизу) —
  // без автоскролла окно по умолчанию открывалось на самой старой записи,
  // самую свежую/актуальную задачу приходилось искать скроллом вниз.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [nodes.length]);

  if (nodes.length === 0) return null;

  const toggle = (i) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Иконка каждого узла — в столбце фиксированной ширины (h-4 w-4) с фоном
  // ЦВЕТА ПАНЕЛИ (bg-surface-alt, тот же, что у контейнера) — так одна
  // сквозная линия (единственный absolute-элемент на весь список, не по
  // сегменту на строку, как раньше) визуально «прокалывается» иконками,
  // не обрывается и не съезжает между строками разной высоты. Раньше у
  // каждой строки была своя, независимо посчитанная линия — на стыке
  // однострочных (прострочка/вовремя) и двухстрочных (переход/касание)
  // узлов она не совпадала, отсюда ощущение «каждая иконка сама по себе».
  // Единый стиль для всех типов узлов — раньше цвет иконки менялся по типу
  // (красная просрочка/зелёное вовремя/навy переход/зелёное касание), теперь
  // все записи ленты выглядят однородно, различаются только иконкой-формой.
  const ICON_TONE = 'text-navy';

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto rounded-field bg-surface-alt p-2">
      {nodes.length > 1 && <span className="absolute bottom-2 left-[16px] top-2 w-px bg-border-strong" />}
      {nodes.map((node, i) =>
        node.type === 'pending' ? (
          <div key={i} className="relative flex items-start gap-1.5 pb-2 last:pb-0">
            <div className={`relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-navy bg-surface-alt text-[9px] font-bold ${ICON_TONE}`}>
              {node.step}
            </div>
            <div className="min-w-0 flex-1 rounded-field border border-navy bg-navy/10 px-1.5 py-1">
              <p className="text-[11px] font-bold leading-tight text-navy">{node.task}</p>
              {node.dueAt && <p className="text-[10px] leading-tight text-navy/70">до {formatRelativeDeadline(node.dueAt)}</p>}
            </div>
          </div>
        ) : (
          <div key={i} className="relative flex items-start gap-1.5 pb-2 last:pb-0">
            <div
              ref={dateOpenAt === i ? dateRef : null}
              className="relative z-10 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setDateOpenAt((v) => (v === i ? null : i));
              }}
            >
              <button
                type="button"
                aria-label="Дата и время"
                className={`flex h-4 w-4 items-center justify-center rounded-full border border-navy bg-surface-alt text-[9px] font-bold ${ICON_TONE}`}
              >
                {node.step}
              </button>
              {dateOpenAt === i && (
                <div className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-field border border-border bg-surface px-2 py-1 text-[10px] text-muted shadow-hover">
                  {node.at ? formatDateTimeShort(node.at) : '—'}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {node.task && <p className="text-[9px] leading-tight text-muted">{node.task}</p>}
              <p
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(i);
                }}
                className={`cursor-pointer text-[11px] leading-tight text-text ${expanded.has(i) ? '' : 'truncate'}`}
              >
                {node.result}
              </p>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/**
 * Раскрывшийся выбор результата касания — зелёная галочка (успешно) и
 * красный крестик (не успешно) в одной кнопке-пилюле. Закрывается кликом
 * вне (onDismiss). Общий для «Дозвона» и «Дожима». `size` — {width, height}
 * кнопки «Касание», вместо которой встаёт пилюля: тот же размер, ничего не прыгает.
 */
function ResultChoice({ onSuccess, onFail, onDismiss, size }) {
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onDismiss();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onDismiss]);

  return (
    <div ref={ref} className="flex h-[30px] w-[84px] shrink-0 overflow-hidden rounded-field" style={size}>
      <button
        type="button"
        onClick={onSuccess}
        aria-label="Успешно"
        className="flex flex-1 items-center justify-center bg-success text-white hover:opacity-90"
      >
        <CheckCircle2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onFail}
        aria-label="Не успешно"
        className="flex flex-1 items-center justify-center bg-danger text-white hover:opacity-90"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Попытки дозвона, см. 2026-08-12-lead-card-call-attempts-design.md.
 * Меню выбора результата — через DropdownMenu (портал, `position: fixed`) —
 * ряд лежит у левого края узкой карточки в канбане, обычный absolute-попап
 * вылезал за край карточки и обрезался/наезжал на соседнюю колонку.
 * `maxAttempts` — из columns.js, своё значение для 'new' и 'calling'
 * (⚙ в шапке соответствующей колонки), только для отображения на кнопке:
 * счётчик попыток общий, сетка «по 2 попытки в день» (nextCallDueAt в
 * leadFunnel.js) и порог автопереноса в «Холодный лид» (LeadsPage.
 * markAttempt) по-прежнему завязаны только на `calling.maxTouches`.
 */
function CallAttemptDots({ attempts, onMark, nextCallDueAt, maxAttempts, onOpenChecklist }) {
  const deadlineLabel = nextCallDueAt ? formatRelativeDeadline(nextCallDueAt) : null;
  const [confirming, setConfirming] = useState(false);
  const [size, setSize] = useState(null);
  const btnRef = useRef(null);
  const dismiss = useCallback(() => setConfirming(false), []);

  if (confirming) {
    return <ResultChoice onSuccess={() => onMark('success')} onFail={() => onMark('fail')} onDismiss={dismiss} size={size} />;
  }

  return (
    <TouchActionButton
      ref={btnRef}
      text={`Касание ${attempts.length}/${maxAttempts}`}
      over={attempts.length > maxAttempts}
      time={deadlineLabel}
      onClick={() => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setSize({ width: r.width, height: r.height });
        setConfirming(true);
        onOpenChecklist?.();
      }}
      ariaLabel={`Касание ${attempts.length + 1}: отметить результат звонка`}
      compact
    />
  );
}

/**
 * Касания в «Дожиме» — задача обязательна на каждом. Максимум
 * рекомендуемых касаний (по умолчанию 2, см. columns.js) регулируется
 * через ⚙ в шапке колонки «Дожим» — в отличие от «Дозвона», тут число не
 * завязано на другую бизнес-логику (нет своей сетки дедлайнов/автопереноса),
 * менять его безопасно.
 */
function TouchDots({ closingTouchNumber, nextTouchAt, onMark, onFail, maxTouches, onPress }) {
  const count = closingTouchNumber ?? 0;
  const deadlineLabel = count < maxTouches && nextTouchAt ? formatRelativeDeadline(nextTouchAt) : null;
  const [confirming, setConfirming] = useState(false);
  const [size, setSize] = useState(null);
  const btnRef = useRef(null);
  const dismiss = useCallback(() => setConfirming(false), []);

  if (confirming) {
    return <ResultChoice onSuccess={onMark} onFail={onFail} onDismiss={dismiss} size={size} />;
  }

  return (
    <TouchActionButton
      ref={btnRef}
      text={`Касание ${count}/${maxTouches}`}
      over={count > maxTouches}
      time={deadlineLabel}
      onClick={() => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setSize({ width: r.width, height: r.height });
        setConfirming(true);
        onPress?.();
      }}
      ariaLabel={`Касание ${count + 1}: отметить результат`}
      compact
    />
  );
}

/**
 * Бейдж «!» в углу карточки (просрочен дедлайн стадии) — клик показывает,
 * что именно просрочено и до какого момента. Тот же трюк с позиционированием
 * относительно карточки, что у LeadInfoPopover (см. ниже) — сам бейдж уже
 * absolute в углу, попап растягивается на всю ширину карточки под ним.
 */
function OverdueBadge({ reason, deadline, overdueBy }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Причина просрочки"
        className="rounded-badge bg-[rgba(225,29,72,0.13)] px-1.5 py-0.5 text-[10px] font-bold text-[#BE123C] dark:bg-[rgba(251,113,133,0.18)] dark:text-[#FDA4AF]"
      >
        {overdueBy || 'Просрочено'}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-field border border-border bg-surface p-3 shadow-hover">
          <p className="text-[13px] font-bold leading-snug text-text">{reason}</p>
          {deadline && <p className="mt-1 text-[11px] leading-snug text-muted">Срок был до {deadline}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Иконка «i» — доп. информация о лиде (ответы на вопросы из синка Google
 * Sheets, см. appsscript/SheetsSync.gs — russianLevel/livesInTashkent/
 * russianLearningReason), скрытая с карточки по умолчанию, чтобы не
 * загромождать компактный вид. Рендерится только если есть что показывать.
 * @param {Array<{question: string, answer: string}>} items
 */
function LeadInfoPopover({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Позиционируется НЕ относительно себя/иконки (та почти всегда не по
  // центру карточки — из-за этого попап вылезал за левый край), а
  // относительно всей карточки (см. `relative` на корневом div карточки
  // ниже) — inset-x повторяет её собственный внутренний отступ p-2.5,
  // поэтому попап всегда ровно по ширине карточки, не шире и не уже.
  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Доп. информация"
        className="flex h-3.5 w-3.5 items-center justify-center text-muted hover:text-navy"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute inset-x-2.5 top-7 z-20 flex flex-col gap-2 rounded-field border border-border bg-surface p-3 shadow-hover">
          {items.map((item, i) => (
            <div key={i}>
              <p className="text-[11px] leading-snug text-muted">{item.question}</p>
              <p className="mt-0.5 text-[13px] font-bold leading-snug text-text">{item.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * «Не выходит на связь» — трекер стадии «Пробный назначен» (в «Дожиме»
 * его больше нет: там неуспешное касание — крестик у «Касание N/M»).
 * Кнопка «Касание» показывает попытки связаться (макс. — из настройки колонки). Каждая
 * попытка — «Перенос» (разрешено один раз за цикл — на пробном сдвигает
 * дату через TrialFormModal, в дожиме сразу просит новый дедлайн касания
 * тут же в onMark) или «Неуспешно». Когда касаний больше рекомендуемого,
 * кнопка остаётся, но бордовая («2/1»); в «Отказ» — через ⋮/стрелку.
 * @param {Object} lead
 * @param {(result: 'reschedule'|'fail', onRescheduleCb?: () => void) => void} onMark
 * @param {() => void} onReschedule доп. действие при «Перенос» — на пробном открывает TrialFormModal, в дожиме no-op. Вызывается ИЗ LeadsPage.markUnreachable, ПОСЛЕ того как задача сохранена (не раньше — иначе форма пробного открылась бы поверх ещё не закрытой DeadlineModal)
 * @param {import('firebase/firestore').Timestamp|null} [nextAttemptDueAt] дедлайн следующей попытки — на пробном unreachableNextCallDueAt, в дожиме nextTouchAt
 */
function UnreachableBlock({ lead, onMark, onReschedule, onCreateStudent, nextAttemptDueAt, maxAttempts = UNREACHABLE_MAX_ATTEMPTS }) {
  const attempts = lead.unreachableAttempts ?? [];

  // Перенос пробного — один раз за весь цикл: либо уже был «Перенос» среди
  // касаний, либо дату пробного двигали через форму (rescheduleCount).
  const rescheduleUsed = attempts.some((a) => a.result === 'reschedule') || (lead.rescheduleCount ?? 0) >= 1;

  // Задачу теперь всегда спрашивает markUnreachable (DeadlineModal) — тут
  // просто передаём результат + onReschedule дальше, сама запись/переход
  // происходит там, уже после того, как оператор ввёл задачу.
  const pick = (result) => onMark(result, onReschedule);
  const deadlineLabel = nextAttemptDueAt ? formatDateTimeShort(nextAttemptDueAt) : null;

  // «Касание» → галочка/крестик (как в «Дозвоне» и «Дожиме»). Крестик — неуспешная
  // попытка связаться; галочка — дозвонились, дальше выбор: создать студента
  // или перенести пробное (один раз).
  const [confirming, setConfirming] = useState(false);
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [size, setSize] = useState(null);
  const btnRef = useRef(null);
  const dismiss = useCallback(() => setConfirming(false), []);

  return (
    <>
      {confirming ? (
        <ResultChoice
          onSuccess={() => {
            setConfirming(false);
            setChoiceOpen(true);
          }}
          onFail={() => {
            setConfirming(false);
            pick('fail');
          }}
          onDismiss={dismiss}
          size={size}
        />
      ) : (
        <TouchActionButton
          ref={btnRef}
          text={`Касание ${attempts.length}/${maxAttempts}`}
          over={attempts.length > maxAttempts}
          time={deadlineLabel}
          onClick={() => {
            const r = btnRef.current?.getBoundingClientRect();
            if (r) setSize({ width: r.width, height: r.height });
            setConfirming(true);
          }}
          ariaLabel={`Касание ${attempts.length + 1}: отметить результат`}
          compact
        />
      )}
      {/* Портал: события всплывают по React-дереву — без stopPropagation клик в окне
          дошёл бы до карточки и открыл её. */}
      <span className="absolute" onClick={(e) => e.stopPropagation()}>
        <Modal open={choiceOpen} onClose={() => setChoiceOpen(false)} title="Пробное занятие">
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setChoiceOpen(false);
                onCreateStudent?.(lead);
              }}
              className="h-11 rounded-field bg-navy px-5 text-[15px] font-bold text-white hover:bg-navy-hover"
            >
              Создать студента
            </button>
            <button
              type="button"
              disabled={rescheduleUsed}
              onClick={() => {
                setChoiceOpen(false);
                pick('reschedule');
              }}
              className="h-11 rounded-field border border-navy bg-white px-5 text-[15px] font-bold text-navy hover:bg-orange-soft/40 disabled:cursor-not-allowed disabled:border-border-strong disabled:text-muted disabled:hover:bg-white"
            >
              Перенести пробное занятие
            </button>
            <p className="text-center text-[12px] text-muted">
              {rescheduleUsed ? 'Пробное уже переносили — второй раз нельзя.' : 'Перенести можно только 1 раз.'}
            </p>
          </div>
        </Modal>
      </span>
    </>
  );
}

/**
 * Карточка лида на 7-стадийной воронке «Заявки» (2026-08-13-leads-funnel-
 * redesign.md). Перетаскивается мышью (native HTML5 DnD) только вперёд по
 * стадиям — терминальные (won/lost) не draggable вовсе.
 * @param {Object} props
 * @param {Object} props.lead документ `students`
 * @param {string} [props.operatorColor] hex-цвет назначенного оператора (`staff.color`)
 * @param {string} [props.operatorName] имя назначенного оператора
 * @param {(lead: Object) => void} props.onOpen
 * @param {(lead: Object) => void} props.onEdit
 * @param {(lead: Object) => void} props.onDecline
 * @param {(lead: Object) => void} props.onDelete полное удаление, только для status=='lead'
 * @param {(lead: Object) => void} props.onScheduleTrial
 * @param {(lead: Object) => void} props.onRescheduleTrial
 * @param {(lead: Object) => void} [props.onCreateStudent] «Создать студента» в окне после галочки у «Касание» на «Пробный назначен»
 * @param {(lead: Object) => void} props.onMarkTouch
 * @param {(lead: Object, stageKey: string) => void} props.onMove
 * @param {(lead: Object, result: 'success'|'fail') => void} props.onMarkAttempt
 * @param {(lead: Object, result: 'reschedule'|'fail') => void} props.onMarkUnreachable
 * @param {(lead: Object, checked: boolean) => void} props.onToggleCallReminder
 * @param {(lead: Object) => void} props.onOpenBooking
 * @param {(lead: Object) => void} props.onDismissFromBoard только для won — скрывает с доски, студент остаётся в системе
 * @param {(lead: Object) => void} props.onResetToNew полный сброс воронки за кодом доступа (ResetLeadModal)
 */
export function LeadCard({
  lead,
  operatorColor,
  operatorName,
  onOpen,
  onEdit,
  onDecline,
  onDelete,
  onScheduleTrial,
  onRescheduleTrial,
  onCreateStudent,
  onMarkTouch,
  onMove,
  onMarkAttempt,
  onMarkUnreachable,
  onToggleCallReminder,
  onOpenBooking,
  onDismissFromBoard,
  onResetToNew,
  onEditChecklist,
  columns = COLUMNS,
  checklistItems = DEFAULT_CHECKLIST_ITEMS,
  highlightLeadId,
}) {
  const highlighted = highlightLeadId === lead.id;
  const stage = lead.funnelStage ?? 'new';
  const isTerminal = stage === 'won' || stage === 'lost';
  // callAttempts общий на 'new'+'calling' (счёт не прерывается при
  // автопереходе), но бейдж «Касание N/M» в «Дозвоне» должен считать
  // только то, что случилось ПОСЛЕ входа в «Дозвон» — попытка, сделанная
  // ещё в «Новом лиде», в счёт «Дозвона» не идёт.
  const callingEnteredAt = (lead.stageHistory ?? []).filter((h) => h.stage === 'calling').at(-1)?.enteredAt;
  const attempts = (lead.callAttempts ?? []).filter(
    (a) => stage !== 'calling' || !callingEnteredAt || msOf(a.at) > msOf(callingEnteredAt),
  );
  const operatorLabel = operatorInitials(operatorName);
  // Раньше жил отдельным слотом слева в футере — теперь там кнопка
  // «Касание N», инициалы переехали в правую группу иконок, рядом с ⋮.
  const operatorBadge = operatorLabel ? (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
      style={{ backgroundColor: `${operatorColor || '#8B94A3'}26`, color: operatorColor || '#8B94A3' }}
    >
      {operatorLabel}
    </span>
  ) : null;
  const [checklistOpen, setChecklistOpen] = useState(false);
  // Чек-лист и «Свободные места» на карточках с кнопкой «Касание» (новый лид,
  // дозвон, дожим) появляются только после её нажатия; на остальных — всегда.
  const [touchPressed, setTouchPressed] = useState(false);
  const hasTouchButton = stage === 'new' || stage === 'calling' || stage === 'closing';
  const showTouchExtras = !hasTouchButton || touchPressed;
  const [formDataOpen, setFormDataOpen] = useState(false);
  const checklistChecked = checklistCheckedCount(lead.checklist, checklistItems);
  const checklistPct = checklistPercent(lead.checklist, checklistItems);

  const createdAt = lead.createdAt?.toDate?.();
  // Риск-бейдж независим от даты (в отличие от overdue) — загорается сразу
  // после неудачной попытки связаться, даже если до пробного ещё далеко.
  const unreachableAttempts = lead.unreachableAttempts ?? [];
  const trialConfirmAtRisk = stage === 'trial_scheduled' && unreachableAttempts[unreachableAttempts.length - 1]?.result === 'fail';
  // «Не выходит на связь» и «Напомнить через звонок» имеют смысл только в
  // контактный день (см. contactDueDate в leadFunnel.js — обычно день
  // пробного, для слота 9:00 — днём раньше) — до этого связываться ещё рано.
  const trialDay = stage === 'trial_scheduled' && lead.trialDate?.toDate ? isTrialDay(lead.trialDate.toDate()) : false;
  const deadline = stageDeadline(lead);
  const overdue = deadline ? Date.now() > deadline.getTime() : false;
  // priority — метка «лид пришёл вне рабочих часов», актуальна только пока
  // не отработан первый SLA на стадии 'new'; дальше по воронке не показываем.
  const priority = stage === 'new' && createdAt ? isPriorityLead(createdAt) : false;

  // Ответы на вопросы из синка Google Sheets (appsscript/SheetsSync.gs) —
  // russianLevel с прошлой таблицы, остальные два с текущей. Каждое поле
  // независимо опционально, в попап «i» попадают только заполненные.
  const infoItems = [
    lead.russianLevel && { question: 'Rus tilida qanday darajadasiz?', answer: lead.russianLevel },
    lead.russianLearningReason && { question: "Rus tilini nima sababdan o'rganmoqchisiz?", answer: lead.russianLearningReason },
    lead.livesInTashkent && { question: 'Toshkentda yashaysizmi?', answer: lead.livesInTashkent },
  ].filter(Boolean);

  const menuItems = [
    // «Пришёл» перенесён на отдельную страницу «Пробные» (там же создаётся
    // сам студент, см. TrialLeadCard) — тут остаётся только «Не пришёл».
    ...(stage === 'trial_scheduled' ? [{ label: 'Не пришёл', onClick: () => onRescheduleTrial(lead) }] : []),
    { label: 'Редактировать', onClick: () => onEdit(lead) },
    // Полный дамп строки Google Sheets (все колонки, не только 3 в
    // LeadInfoPopover) — только для лидов из синка (rawColumns заполнен).
    ...(lead.rawColumns ? [{ label: 'Данные из формы', onClick: () => setFormDataOpen(true) }] : []),
    // Пункт виден на любой нетерминальной стадии — реально удаляет только
    // status=='lead' (правило Firestore), для остальных DeleteLeadModal
    // покажет понятную ошибку («есть записи в группу»), не молча блокирует
    // пункт меню. Оплаченных («Оплачено») насовсем не удаляем никогда —
    // с этой стадии карточку можно только скрыть с доски (см. won-ветку ниже).
    ...(stage !== 'won' ? [{ label: 'Удалить навсегда', danger: true, onClick: () => onDelete(lead) }] : []),
    // Полный сброс воронки — за кодом доступа (ResetLeadModal), не для
    // 'new' (сбрасывать уже некуда) и не для 'won' (там своё урезанное
    // меню без этого пункта вовсе).
    ...(stage !== 'new' && stage !== 'won' ? [{ label: 'Вернуть в новый лид', danger: true, onClick: () => onResetToNew(lead) }] : []),
  ];

  const moveItems = columns.filter(
    (c) => isForwardAllowed(stage, c.key),
  ).map((c) => ({
    label: c.label,
    danger: c.key === 'lost',
    // «Пробный назначен» требует дату/время/учителя, «Отказ» — причину из
    // фиксированного списка — открываем те же формы, что и «⋮», вместо
    // голого onMove.
    onClick: () => {
      if (c.key === 'trial_scheduled') return onScheduleTrial(lead);
      if (c.key === 'lost') return onDecline(lead);
      return onMove(lead, c.key);
    },
  }));

  return (
    <div
      id={`lead-card-${lead.id}`}
      role="button"
      tabIndex={0}
      draggable={!isTerminal}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', lead.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === 'Enter' && onOpen(lead)}
      className={`group relative flex flex-col gap-2.5 rounded-xl border bg-card p-3.5 pb-[3px] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        checklistOpen ? 'min-h-[237px]' : 'h-[237px]'
      } ${
        isTerminal ? 'cursor-pointer border-border' : 'cursor-grab border-border hover:border-navy/20 active:cursor-grabbing'
      } ${
        priority && !overdue ? 'border-l-4 border-l-orange-soft' : ''
      } ${
        highlighted ? 'ring-4 ring-navy ring-offset-2' : ''
      }`}
    >
      {/* Шапка — цвет карточки на 30% темнее (bg-card-head); статус (просрочка/
          «В норме») читается по бейджу рядом с именем. Отрицательные margin/
          rounded-t растягивают заливку до краёв карточки поверх её p-3.5. */}
      <div className="-mx-3.5 -mt-3.5 flex items-center justify-between gap-2 rounded-t-xl bg-card-head px-3.5 pb-1.5 pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 truncate text-[13px] font-bold leading-tight text-text">{lead.fullName}</p>
          {overdue ? (
            <OverdueBadge
              reason={overdueReasonLabel(lead)}
              deadline={deadline ? format(deadline, 'dd.MM.yyyy HH:mm', { locale: ru }) : null}
              overdueBy={deadline ? formatOverdueBy(deadline) : null}
            />
          ) : (
            !isTerminal && (
              <span className="shrink-0 rounded-badge bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">В норме</span>
            )
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {trialConfirmAtRisk && <PhoneOff className="h-3.5 w-3.5 text-[#E5842B]" aria-label="Не берёт трубку — подтверждение пробного" />}
          {infoItems.length > 0 && <LeadInfoPopover items={infoItems} />}
          <a href={`tel:+${lead.phone}`} onClick={(e) => e.stopPropagation()} className="truncate text-[12px] text-link">
            {formatPhone(lead.phone)}
          </a>
        </div>
      </div>

      {(stage === 'new' || stage === 'calling') && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <HistoryTimeline lead={lead} />
        </div>
      )}

      {stage === 'trial_scheduled' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="truncate text-[12px] text-muted">{trialScheduleLabel(lead)}</span>
          {!trialDay && lead.trialDate?.toDate && (
            <span className="text-[11px] text-muted">
              Напомнить: {formatRelativeDay(contactDueDate(lead.trialDate.toDate()))}
            </span>
          )}
          <HistoryTimeline lead={lead} />
        </div>
      )}

      {stage === 'trial_completed' && (
        <div className="flex min-h-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
          <HistoryTimeline lead={lead} />
        </div>
      )}

      {stage === 'closing' && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <HistoryTimeline lead={lead} />
        </div>
      )}

      {stage === 'won' && (
        <div className="flex min-h-0 flex-1 flex-col" onClick={(e) => e.stopPropagation()}>
          <HistoryTimeline lead={lead} />
        </div>
      )}

      {stage === 'lost' && (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          {lead.lostReason && (
            <p className="text-[12px] text-danger">
              Причина: {LOST_REASON_OPTIONS.find((o) => o.value === lead.lostReason)?.label ?? lead.lostReason}
              {lead.lostReasonDetail ? ` — ${lead.lostReasonDetail}` : ''}
            </p>
          )}
          <HistoryTimeline lead={lead} />
        </div>
      )}

      {/* Modal рендерится в document.body через портал, но события всплывают
          по React-дереву, не DOM — без stopPropagation клик внутри модалки
          (например, «Закрыть») доходил бы до onClick корня карточки и
          открывал бы её (onOpen). `absolute` — вне потока: даже пустой
          (target=null) div-обёртка как обычный flex-ребёнок карточки всё
          равно получала свою пару gap-2.5 с обеих сторон (0 своей высоты,
          но два зазора), раздваивая отступ вокруг себя. */}
      <div className="absolute" onClick={(e) => e.stopPropagation()}>
        <LeadFormDataModal target={formDataOpen ? { lead } : null} onClose={() => setFormDataOpen(false)} />
      </div>

      {/* Единый узкий блок низа карточки — ряд иконок + (при открытии)
          чек-лист/комментарии + строка даты/источника, все на gap-0.5
          вместо общего для всей карточки gap-2.5: раньше между рядом
          иконок и строкой даты был двойной зазор (корневой gap плюс ещё
          один — от соседнего пустого div модалки, см. выше). */}
      <div className="mt-auto flex flex-col gap-0.5">
        <div className="flex items-center justify-between border-t border-border pt-1" onClick={(e) => e.stopPropagation()}>
          {stage === 'new' || stage === 'calling' ? (
            <CallAttemptDots
              attempts={attempts}
              onMark={(result) => onMarkAttempt(lead, result)}
              nextCallDueAt={lead.nextCallDueAt}
              maxAttempts={columns.find((c) => c.key === stage)?.maxTouches ?? 5}
              onOpenChecklist={() => {
                setChecklistOpen(true);
                setTouchPressed(true);
              }}
            />
          ) : stage === 'closing' ? (
            <TouchDots
              closingTouchNumber={lead.closingTouchNumber}
              nextTouchAt={lead.nextTouchAt}
              onMark={() => onMarkTouch(lead)}
              onFail={() => onMarkUnreachable(lead, 'fail', () => {})}
              maxTouches={columns.find((c) => c.key === 'closing')?.maxTouches ?? 2}
              onPress={() => setTouchPressed(true)}
            />
          ) : stage === 'trial_scheduled' ? (
            <UnreachableBlock
              lead={lead}
              onMark={(result, onRescheduleCb) => onMarkUnreachable(lead, result, onRescheduleCb)}
              onReschedule={() => onRescheduleTrial(lead)}
              onCreateStudent={onCreateStudent}
              nextAttemptDueAt={lead.unreachableNextCallDueAt}
              maxAttempts={columns.find((c) => c.key === 'trial_scheduled')?.maxTouches ?? UNREACHABLE_MAX_ATTEMPTS}
            />
          ) : (
            <span />
          )}
        {stage === 'won' ? (
          // «Оплачено» — карточка ведёт себя как уведомление: только
          // посмотреть (клик по карточке) и скрыть с доски. Ни коммента, ни
          // ⋮-меню с «Удалить навсегда» тут никогда не было и не будет —
          // студент остаётся в системе, убирается только вид на доске
          // (onDismissFromBoard, см. LeadsPage.boardHiddenAt).
          <button
            type="button"
            onClick={() => onDismissFromBoard(lead)}
            aria-label="Скрыть с доски"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5">
            {(stage === 'new' || stage === 'calling') && showTouchExtras && (
              <button
                type="button"
                onClick={() => setChecklistOpen((v) => !v)}
                aria-label="Чек-лист"
                className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-alt ${
                  checklistOpen
                    ? 'text-navy'
                    : checklistChecked === 0
                      ? 'text-muted'
                      : checklistPct === 100
                        ? 'text-success'
                        : 'text-[#E5842B]'
                }`}
              >
                <ClipboardCheck className="h-4 w-4" />
              </button>
            )}
            {!isTerminal && showTouchExtras && (
              <button
                type="button"
                onClick={() => onOpenBooking(lead)}
                aria-label="Свободные места в группе"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
              >
                <Users className="h-4 w-4" />
              </button>
            )}
            {!isTerminal && moveItems.length > 0 && <DropdownMenu items={moveItems} icon={ArrowRight} ariaLabel="Перенести в колонку" />}
            <DropdownMenu items={menuItems} />
          </div>
        )}
      </div>

        {(stage === 'new' || stage === 'calling') && checklistOpen && (
          <LeadChecklistPanel leadId={lead.id} checklist={lead.checklist} items={checklistItems} onEditItems={onEditChecklist} />
        )}

        <div className="flex items-end justify-between">
          <span className="text-[10px] text-muted">
            {formatDateTimeShort(lead.createdAt)}
            {formatSource(lead.source) ? ` · ${formatSource(lead.source)}` : ''}
            {stage === 'new' || stage === 'calling' ? ` · Чек-лист ${checklistPct}%` : ''}
          </span>
          {operatorBadge}
        </div>
      </div>
    </div>
  );
}
