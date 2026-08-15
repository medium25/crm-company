import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

// Порядок отображения — Пн→Вс; индекс каждого дня в state/массиве —
// реальный date.getDay() (0=Вс), та же конвенция что в lib/schedule.js.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_LABELS = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' };
const DEFAULT_TIME = { start: '09:00', end: '18:00' };

function toDraft(schedule) {
  return Array.from({ length: 7 }, (_, i) => {
    const day = schedule?.[i];
    return day ? { enabled: true, start: day.start, end: day.end } : { enabled: false, ...DEFAULT_TIME };
  });
}

// Проверка одного рабочего дня — оба поля заполнены и начало раньше конца.
// Ночные смены (конец раньше начала) не поддерживаются: isOperatorWorkingAt
// сравнивает время строками, для них потребовалась бы отдельная логика.
// Возвращает { start?, end? } с текстом ошибки для соответствующего поля
// (пусто — день валиден), по established-конвенции Input.error.
function dayFieldErrors(day) {
  if (!day.enabled) return {};
  const errors = {};
  if (!day.start) errors.start = 'Укажите время начала.';
  if (!day.end) errors.end = 'Укажите время окончания.';
  if (day.start && day.end && day.start >= day.end) {
    errors.end = 'Должно быть позже времени начала.';
  }
  return errors;
}

/**
 * Расписание одного оператора — settings/{branchId}.operatorSchedules[operator.id],
 * не staff/{id} (staff.update запрещён для admin-роли на не-teacher
 * записях, settings — нет). Пишет только свой ключ через merge:true —
 * вложенный объект мержится Firestore по ключам, соседние операторы не
 * задеваются.
 * @param {Object} props
 * @param {{id: string, fullName: string}|null} props.operator null — закрыто
 * @param {Array<{start: string, end: string}|null>|undefined} props.schedule текущее расписание оператора
 * @param {() => void} props.onClose
 */
export function OperatorScheduleModal({ operator, schedule, onClose }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [draft, setDraft] = useState(() => toDraft(schedule));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (operator) {
      setDraft(toDraft(schedule));
      setErrors({});
    }
  }, [operator, schedule]);

  const setDay = (dayIndex, patch) => {
    setDraft((d) => d.map((day, i) => (i === dayIndex ? { ...day, ...patch } : day)));
    setErrors((e) => (e[dayIndex] ? { ...e, [dayIndex]: {} } : e));
  };

  const handleSave = async () => {
    const nextErrors = {};
    let hasErrors = false;
    draft.forEach((day, i) => {
      const fieldErrors = dayFieldErrors(day);
      if (fieldErrors.start || fieldErrors.end) hasErrors = true;
      nextErrors[i] = fieldErrors;
    });
    if (hasErrors) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      const weekSchedule = draft.map((day) => (day.enabled ? { start: day.start, end: day.end } : null));
      await setDoc(
        doc(db, 'settings', activeBranchId),
        { operatorSchedules: { [operator.id]: weekSchedule }, updatedAt: serverTimestamp(), updatedBy: user.uid },
        { merge: true },
      );
      showToast('Расписание сохранено.');
      onClose();
    } catch {
      showToast('Не удалось сохранить расписание.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(operator)}
      onClose={onClose}
      title={`Расписание: ${operator?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSave} loading={saving}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {DAY_ORDER.map((dayIndex) => {
          const day = draft[dayIndex];
          const dayErrors = errors[dayIndex] ?? {};
          return (
            <div key={dayIndex} className="flex items-start gap-3">
              <label className="mt-3 flex w-24 shrink-0 items-center gap-2 text-[15px] text-text">
                <input type="checkbox" checked={day.enabled} onChange={(e) => setDay(dayIndex, { enabled: e.target.checked })} />
                {DAY_LABELS[dayIndex]}
              </label>
              <Input
                type="time"
                value={day.start}
                disabled={!day.enabled}
                error={dayErrors.start}
                onChange={(e) => setDay(dayIndex, { start: e.target.value })}
              />
              <span className="mt-3 text-muted">—</span>
              <Input
                type="time"
                value={day.end}
                disabled={!day.enabled}
                error={dayErrors.end}
                onChange={(e) => setDay(dayIndex, { end: e.target.value })}
              />
            </div>
          );
        })}
        <p className="text-[13px] text-muted">Ночные смены (время окончания раньше времени начала) не поддерживаются.</p>
      </div>
    </Modal>
  );
}
