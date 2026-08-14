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
 * @param {{lead: Object, title: string, suggestedDate: Date, onConfirm: (date: Date) => Promise<void>}|null} props.target
 * @param {() => void} props.onClose
 */
export function DeadlineModal({ target, onClose }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setDate(format(target.suggestedDate, 'yyyy-MM-dd'));
    setTime(format(target.suggestedDate, 'HH:mm'));
  }, [target]);

  if (!target) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await target.onConfirm(new Date(`${date}T${time}:00`));
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
        <p className="text-[13px] text-muted">Дедлайн следующего действия по «{target.lead.fullName}»</p>
        <DatePicker label="Дата" required value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="Время" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
      </form>
    </Modal>
  );
}
