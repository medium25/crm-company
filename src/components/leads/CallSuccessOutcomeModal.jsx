import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';
import { DatePicker } from '../ui/DatePicker.jsx';

/**
 * После успешного дозвона («трубку взяли, разговор состоялся») — три
 * реальных исхода вместо голого «дедлайн следующего звонка»: клиент взял
 * время подумать (комментарий + новый дедлайн), записался на пробный
 * (передаём дальше в TrialFormModal), отказался (передаём в
 * DeclineLeadModal). Экран «думает» — единственный, что закрывается прямо
 * тут; «Запись»/«Отказ» просто вызывают колбэк и модалка закрывается,
 * дальше ведёт уже другая форма.
 * @param {Object} props
 * @param {{lead: Object, suggestedDate: Date, onThink: (comment: string, date: Date) => Promise<void>, onTrial: () => void, onDecline: () => void}|null} props.target
 * @param {() => void} props.onClose
 */
export function CallSuccessOutcomeModal({ target, onClose }) {
  const [step, setStep] = useState('choose');
  const [comment, setComment] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setStep('choose');
    setComment('');
    setDate(format(target.suggestedDate, 'yyyy-MM-dd'));
    setTime(format(target.suggestedDate, 'HH:mm'));
  }, [target]);

  if (!target) return null;

  const submitThink = async () => {
    setSaving(true);
    try {
      await target.onThink(comment.trim(), new Date(`${date}T${time}:00`));
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
          <div>
            <label className="mb-1 block text-[13px] text-muted">Комментарий</label>
            <textarea
              className="min-h-20 w-full resize-none rounded-field border border-border bg-surface p-2 text-[14px] text-text focus:border-navy focus:outline-none"
              placeholder="Что сказал клиент, о чём договорились…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
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
        <Button onClick={() => setStep('think')}>Думает</Button>
        <Button
          onClick={() => {
            onClose();
            target.onTrial();
          }}
        >
          Запись на пробный
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onClose();
            target.onDecline();
          }}
        >
          Отказ
        </Button>
      </div>
    </Modal>
  );
}
