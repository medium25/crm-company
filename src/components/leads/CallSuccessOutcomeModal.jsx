import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * После успешного дозвона («трубку взяли, разговор состоялся») — три
 * реальных исхода вместо голого «дедлайн следующего звонка»: клиент взял
 * время подумать (задача + новый дедлайн), записался на пробный (передаём
 * дальше в TrialFormModal), отказался (передаём в DeclineLeadModal).
 *
 * Задача (что сделать / о чём договорились) — обязательна для ЛЮБОГО из
 * трёх исходов (каждое касание лида должно нести задачу), поэтому поле
 * вынесено на экран выбора исхода, а не только внутрь «Думает» — кнопки
 * исхода заблокированы, пока задача не заполнена. «Думает» дополнительно
 * просит новый дедлайн звонка (единственный исход, что не уводит лида со
 * стадии «Дозвон» сразу).
 * @param {Object} props
 * @param {{lead: Object, suggestedDate: Date, onThink: (task: string, date: Date) => Promise<void>, onTrial: (task: string) => void, onDecline: (task: string) => void}|null} props.target
 * @param {() => void} props.onClose
 */
export function CallSuccessOutcomeModal({ target, onClose }) {
  const [step, setStep] = useState('choose');
  const [task, setTask] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setStep('choose');
    setTask('');
    setDate(format(target.suggestedDate, 'yyyy-MM-dd'));
    setTime(format(target.suggestedDate, 'HH:mm'));
  }, [target]);

  if (!target) return null;

  const submitThink = async () => {
    setSaving(true);
    try {
      await target.onThink(task.trim(), new Date(`${date}T${time}:00`));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (step === 'think') {
    return (
      <Modal
        open={Boolean(target)}
        onClose={onClose}
        title="Клиент думает"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep('choose')}>
              Назад
            </Button>
            <Button onClick={submitThink} loading={saving}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <DatePicker label="Дата следующего звонка" required value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Время" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Дозвон успешен">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] text-muted">Что дальше с «{target.lead.fullName}»?</p>
        <div>
          <label className="mb-1 block text-[13px] text-muted">Задача</label>
          <textarea
            className="min-h-20 w-full resize-none rounded-field border border-border bg-surface p-2 text-[14px] text-text focus:border-navy focus:outline-none"
            placeholder="Что сказал клиент, о чём договорились…"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
        </div>
        <Button disabled={!task.trim()} onClick={() => setStep('think')}>
          Думает
        </Button>
        <Button
          disabled={!task.trim()}
          onClick={() => {
            onClose();
            target.onTrial(task.trim());
          }}
        >
          Запись на пробный
        </Button>
        <Button
          variant="secondary"
          disabled={!task.trim()}
          onClick={() => {
            onClose();
            target.onDecline(task.trim());
          }}
        >
          Отказ
        </Button>
      </div>
    </Modal>
  );
}
