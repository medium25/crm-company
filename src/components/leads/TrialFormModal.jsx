import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import {
  addDays,
  addMonths,
  subMonths,
  eachDayOfInterval,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  format,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage, trialConfirmDueAt } from '../../lib/leadFunnel.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';

const DEFAULT_TIME_SLOTS = ['09:00', '10:30', '14:00', '15:30', '17:00', '18:30', '20:00'];
const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Свой календарь для даты пробного (не нативный input[type=date] — тот
 * визуально выбивался из дизайна формы) + быстрые пикы («Сегодня»/«Завтра»/
 * «Послезавтра»/дни недели — обычно оператору проще ткнуть «Вторник», чем
 * листать календарь). Только date-fns для дат, без сторонней библиотеки
 * календаря.
 * @param {{ value: string, onChange: (isoDate: string) => void }} props
 */
function TrialCalendar({ value, onChange }) {
  const selected = useMemo(() => parseISO(value), [value]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selected));

  useEffect(() => {
    setViewMonth(startOfMonth(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pick = (d) => onChange(format(d, 'yyyy-MM-dd'));

  const today = useMemo(() => new Date(), []);
  const quickDays = [
    { label: 'Сегодня', date: today },
    { label: 'Завтра', date: addDays(today, 1) },
    { label: 'Послезавтра', date: addDays(today, 2) },
  ];
  const weekdayPicks = WEEKDAY_LABELS.map((label, i) => {
    const dow = (i + 1) % 7; // Пн=1 … Сб=6, Вс=0 — под getDay()
    const diff = (dow - today.getDay() + 7) % 7;
    return { label, date: addDays(today, diff) };
  });

  const gridStart = startOfWeek(viewMonth, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const quickButtonClass = (d) =>
    `rounded-field border px-2.5 py-1 text-[12px] font-bold ${
      isSameDay(d, selected) ? 'border-navy bg-navy text-white' : 'border-border-strong text-text hover:bg-surface-alt'
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {quickDays.map((q) => (
          <button key={q.label} type="button" onClick={() => pick(q.date)} className={quickButtonClass(q.date)}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {weekdayPicks.map((q) => (
          <button key={q.label} type="button" onClick={() => pick(q.date)} className={quickButtonClass(q.date)}>
            {q.label}
          </button>
        ))}
      </div>

      <div className="rounded-field border border-border-strong p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setViewMonth((m) => subMonths(m, 1))}
            aria-label="Предыдущий месяц"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-bold capitalize text-text">{format(viewMonth, 'LLLL yyyy', { locale: ru })}</span>
          <button
            type="button"
            onClick={() => setViewMonth((m) => addMonths(m, 1))}
            aria-label="Следующий месяц"
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-surface-alt"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 pb-1 text-center text-[11px] text-muted">
          {WEEKDAY_LABELS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((d) => {
            const inMonth = isSameMonth(d, viewMonth);
            const selectedDay = isSameDay(d, selected);
            return (
              <button
                key={d.toISOString()}
                type="button"
                onClick={() => pick(d)}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] ${
                  selectedDay ? 'bg-navy font-bold text-white' : inMonth ? 'text-text hover:bg-surface-alt' : 'text-border hover:bg-surface-alt'
                } ${isToday(d) && !selectedDay ? 'ring-1 ring-navy/40' : ''}`}
              >
                {format(d, 'd')}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Назначение или перенос даты пробного урока (2026-08-13-leads-funnel-
 * redesign.md §5). `mode: 'schedule'` — первое назначение, переводит лида
 * в `trial_scheduled` через `advanceStage`. `mode: 'reschedule'` — перенос:
 * та же форма, но стадия не меняется (лид остаётся в `trial_scheduled`),
 * только новая дата и `rescheduleCount += 1`.
 *
 * Учителя тут не выбираем — только курс (Рус/Англ) и время из
 * настраиваемого списка (Настройки → Справочники → «Время пробных
 * уроков»); день недели карточка сама выводит из даты.
 * @param {Object} props
 * @param {{lead: Object, mode: 'schedule'|'reschedule'}|null} props.target
 * @param {string[]} [props.timeSlots] доступные времена, из branchSettings.trialTimeSlots
 * @param {() => void} props.onClose
 */
export function TrialFormModal({ target, timeSlots = DEFAULT_TIME_SLOTS, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(timeSlots[0] ?? DEFAULT_TIME_SLOTS[0]);
  const [courseId, setCourseId] = useState('');
  const [telegramReminderSent, setTelegramReminderSent] = useState(false);
  const [saving, setSaving] = useState(false);

  const coursesQuery = useMemo(() => (db ? query(collection(db, 'courses'), where('isArchived', '==', false)) : null), []);
  const { data: coursesRaw } = useCollection(coursesQuery);
  const courses = useMemo(() => [...coursesRaw].sort((a, b) => a.name.localeCompare(b.name)), [coursesRaw]);

  useEffect(() => {
    if (!target) return;
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setTime(timeSlots[0] ?? DEFAULT_TIME_SLOTS[0]);
    setCourseId(target.lead.trialCourseId ?? '');
    setTelegramReminderSent(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;
  const { lead, mode } = target;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const trialDateJs = new Date(`${date}T${time}:00`);
      const trialDate = Timestamp.fromDate(trialDateJs);
      const course = courses.find((c) => c.id === courseId);
      // Перенос тоже пересчитывает confirmDueAt и обнуляет попытки — старые
      // попытки дозвона относились к прежней дате пробного (спец «Перенос
      // пробного сбрасывает цикл подтверждения»).
      const confirmDueAt = Timestamp.fromDate(trialConfirmDueAt(trialDateJs));
      const trialFields = {
        trialDate,
        trialCourseId: courseId || null,
        trialCourseName: course?.name ?? null,
        trialConfirmDueAt: confirmDueAt,
        trialConfirmAttempts: [],
        telegramReminderSent,
        // Напоминание на новую дату — старая галочка относилась к прежней.
        callReminderDone: false,
      };
      if (mode === 'schedule') {
        await advanceStage(db, lead, 'trial_scheduled', { status: 'trial', trialAt: serverTimestamp(), ...trialFields }, user);
        showToast(`${lead.fullName}: пробный назначен.`);
      } else {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'students', lead.id), {
          ...trialFields,
          rescheduleCount: (lead.rescheduleCount ?? 0) + 1,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        showToast(`${lead.fullName}: пробный перенесён.`);
      }
      onClose();
    } catch {
      showToast('Не удалось сохранить дату пробного.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={mode === 'schedule' ? `Пробный: ${lead.fullName}` : `Перенос пробного: ${lead.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Сохранить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Курс"
          required
          options={[{ value: '', label: 'Не выбран' }, ...courses.map((c) => ({ value: c.id, label: c.name }))]}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        />
        <label className="block">
          <span className="mb-1 block text-[13px] text-muted">Дата</span>
          <TrialCalendar value={date} onChange={setDate} />
        </label>
        <Select
          label="Время"
          required
          options={timeSlots.map((t) => ({ value: t, label: t }))}
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
        <div>
          <label className="flex items-start gap-2 text-[14px] text-text">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={telegramReminderSent}
              onChange={(e) => setTelegramReminderSent(e.target.checked)}
            />
            <span>Отправка локации и напоминания за 1 день до пробного урока через Telegram</span>
          </label>
          <p className="mt-1 text-[12px] text-danger">
            Ставьте галочку только если действительно отправили локацию и напоминание — за ложную отметку штраф до 100 000 сум.
          </p>
        </div>
      </form>
    </Modal>
  );
}
