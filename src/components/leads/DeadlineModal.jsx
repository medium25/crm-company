import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * Подтверждение дедлайна следующего действия — открывается перед каждой
 * записью, которая продвигает лида на нетерминальную стадию (отметка
 * попытки дозвона, касание в «Дожиме», явка на пробный, ручной перенос
 * карточки). Дата предзаполнена автоматическим расчётом (та же логика, что
 * в stageDeadline), оператор может поправить перед сохранением — тихого
 * автовычисления без подтверждения больше нет ни в одном из этих мест.
 * @param {Object} props
 * @param {{lead: Object, title: string, suggestedDate?: Date, onConfirm: (date: Date|null, task: string) => Promise<void>, lockDate?: boolean, noDate?: boolean, requireTask?: boolean, validate?: (date: Date) => string|null}|null} props.target
 *   `lockDate` — день менять нельзя (только время); используется там, где
 *   день дедлайна жёстко привязан к дате пробного («Дожим») — у дозвона
 *   день теперь свободный, только предзаполнен подсказкой (2 сегодня/2
 *   завтра/1 послезавтра), оператор может поправить под реальный график.
 *   `noDate` — без полей даты/времени вообще (терминальные/бездедлайновые
 *   отметки — холодный лид, финальное касание «Дожима»); `onConfirm`
 *   получает `date: null`. `requireTask` — обязательное короткое поле
 *   «Задача» (что сделать/о чём договорились), значение чипом отображается
 *   на карточке (см. LeadCard.jsx) — каждое касание обязано его нести.
 *   `validate` — доп. проверка выбранного времени (напр. рабочие часы
 *   оператора) — при ошибке возвращает текст, «Подтвердить» её показывает
 *   и не сохраняет.
 * @param {() => void} props.onClose
 */
export function DeadlineModal({ target, onClose }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [task, setTask] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    if (!target.noDate) {
      setDate(format(target.suggestedDate, 'yyyy-MM-dd'));
      setTime(format(target.suggestedDate, 'HH:mm'));
    }
    setTask('');
    setError('');
  }, [target]);

  if (!target) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (target.requireTask && !task.trim()) {
      setError('Укажи задачу.');
      return;
    }
    const candidate = target.noDate ? null : new Date(`${date}T${time}:00`);
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
      await target.onConfirm(candidate, task.trim());
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
          <Button onClick={handleSubmit} loading={saving}>
            Подтвердить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[13px] text-muted">
          {target.noDate ? 'Задача по' : 'Дедлайн следующего действия по'} «{target.lead.fullName}»
        </p>
        {target.requireTask && (
          <Input
            label="Задача"
            required
            placeholder="Что сделать / о чём договорились"
            value={task}
            onChange={(e) => {
              setTask(e.target.value);
              setError('');
            }}
          />
        )}
        {!target.noDate && (
          <>
            <div>
              <DatePicker
                label="Дата"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError('');
                }}
                disabled={target.lockDate}
              />
              {target.lockDate && (
                <p className="mt-1 text-[12px] text-muted">
                  День дозвона фиксирован — 2 звонка сегодня, 2 завтра, 1 послезавтра. Можно поправить только время.
                </p>
              )}
            </div>
            <Input
              label="Время"
              type="time"
              required
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                setError('');
              }}
            />
          </>
        )}
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
