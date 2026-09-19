import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, addDays, startOfDay } from 'date-fns';
import { Calendar } from 'lucide-react';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';
import { formatRelativeDeadline } from '../../lib/format.js';

const MARGIN = 8;
const QUICK_DAYS = [
  { label: 'Сегодня', offset: 0 },
  { label: 'Завтра', offset: 1 },
  { label: 'Послезавтра', offset: 2 },
];

/**
 * Компактный выбор дедлайна в одну строку (как в amoCRM) — кнопка-поле
 * показывает уже выбранные день+время вместе («сегодня в 18:00»), клик
 * открывает поповер с быстрыми днями (Сегодня/Завтра/Послезавтра) + точной
 * датой/временем — вместо двух всегда развёрнутых полей «Дата»/«Время»
 * друг под другом.
 * @param {Object} props
 * @param {Date|null} props.value
 * @param {(date: Date) => void} props.onChange
 * @param {string} [props.error]
 */
export function DeadlinePicker({ value, onChange, error }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const p = panelRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - t.bottom;
    const openUpward = spaceBelow < p.height + MARGIN && t.top > p.height + MARGIN;
    setStyle({
      position: 'fixed',
      top: openUpward ? t.top - p.height - 4 : t.bottom + 4,
      left: Math.max(MARGIN, Math.min(t.left, window.innerWidth - p.width - MARGIN)),
      width: t.width,
    });
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const pickDay = (offset) => {
    const next = addDays(startOfDay(new Date()), offset);
    next.setHours(value?.getHours() ?? 18, value?.getMinutes() ?? 0, 0, 0);
    onChange(next);
  };

  const setDateStr = (dateStr) => {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    const next = new Date(value ?? new Date());
    next.setFullYear(y, m - 1, d);
    onChange(next);
  };

  const setTimeStr = (timeStr) => {
    if (!timeStr) return;
    const [h, m] = timeStr.split(':').map(Number);
    const next = new Date(value ?? new Date());
    next.setHours(h, m, 0, 0);
    onChange(next);
  };

  return (
    <div>
      <span className="mb-1 block text-[13px] text-muted">Дедлайн</span>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-11 w-full items-center gap-2 rounded-field border bg-white px-3 text-left text-[15px] text-text focus:outline-none focus:ring-2 focus:ring-navy/15 ${
          error ? 'border-danger' : 'border-border-strong focus:border-navy'
        }`}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted" />
        {value ? formatRelativeDeadline(value) : 'Выбрать дедлайн'}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={style ?? { position: 'fixed', top: -9999, left: -9999 }}
            className="z-[60] flex flex-col gap-3 rounded-field border border-border bg-surface p-3 shadow-hover"
          >
            <div className="flex gap-1.5">
              {QUICK_DAYS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => pickDay(q.offset)}
                  className="flex-1 rounded-field border border-border-strong px-2 py-1.5 text-[13px] font-bold text-text hover:bg-surface-alt"
                >
                  {q.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <DatePicker
                value={value ? format(value, 'yyyy-MM-dd') : ''}
                onChange={(e) => setDateStr(e.target.value)}
                className="h-10"
              />
              <Input type="time" value={value ? format(value, 'HH:mm') : ''} onChange={(e) => setTimeStr(e.target.value)} className="h-10 w-28" />
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="self-end rounded-field bg-navy px-4 py-1.5 text-[13px] font-bold text-white hover:bg-navy-hover"
            >
              Готово
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Подтверждение дедлайна следующего действия — открывается перед каждой
 * записью, которая продвигает лида на нетерминальную стадию (отметка
 * попытки дозвона, касание в «Дожиме», явка на пробный, ручной перенос
 * карточки). Дата предзаполнена автоматическим расчётом (та же логика, что
 * в stageDeadline), оператор может поправить перед сохранением — тихого
 * автовычисления без подтверждения больше нет ни в одном из этих мест.
 * @param {Object} props
 * @param {{lead: Object, title: string, suggestedDate?: Date, onConfirm: (date: Date|null, outcome: string, nextStep: string) => Promise<void>, noDate?: boolean, requireTask?: boolean, validate?: (date: Date) => string|null}|null} props.target
 *   Дата дедлайна всегда свободная — `suggestedDate` только предзаполняет.
 *   `noDate` — без поля дедлайна вообще (терминальные/бездедлайновые
 *   отметки — холодный лид, финальное касание «Дожима»); `onConfirm`
 *   получает `date: null`. `requireTask` — два обязательных коротких поля,
 *   «Что произошло?» и «Следующий шаг» — значение отображается на карточке
 *   (см. LeadCard.jsx) — каждое касание обязано их нести.
 *   `validate` — доп. проверка выбранного времени (напр. рабочие часы
 *   оператора) — при ошибке возвращает текст, «Подтвердить» её показывает
 *   и не сохраняет.
 * @param {() => void} props.onClose
 */
export function DeadlineModal({ target, onClose }) {
  const [deadline, setDeadline] = useState(null);
  const [outcome, setOutcome] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setDeadline(target.noDate ? null : target.suggestedDate);
    setOutcome('');
    setNextStep('');
    setError('');
  }, [target]);

  if (!target) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (target.requireTask && !outcome.trim()) {
      setError('Укажи, что произошло.');
      return;
    }
    if (target.requireTask && !nextStep.trim()) {
      setError('Укажи следующий шаг.');
      return;
    }
    const candidate = target.noDate ? null : deadline;
    if (!target.noDate) {
      const validationError = target.validate?.(candidate);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setError('');
    setSaving(true);
    try {
      await target.onConfirm(candidate, outcome.trim(), nextStep.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      onClose={onClose}
      title={target.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            loading={saving}
            disabled={target.requireTask && (!outcome.trim() || !nextStep.trim())}
          >
            Подтвердить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {target.requireTask && (
          <>
            <Input
              label="Что произошло?"
              required
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setError('');
              }}
            />
            <Input
              label="Следующий шаг"
              required
              value={nextStep}
              onChange={(e) => {
                setNextStep(e.target.value);
                setError('');
              }}
            />
          </>
        )}
        {!target.noDate && (
          <DeadlinePicker
            value={deadline}
            onChange={(d) => {
              setDeadline(d);
              setError('');
            }}
            error={error}
          />
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
