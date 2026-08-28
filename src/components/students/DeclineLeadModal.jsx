import { useState } from 'react';
import { serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { advanceStage, LOST_REASON_OPTIONS } from '../../lib/leadFunnel.js';
import { analyzeLeadDeviations } from '../../lib/leadDeviationAnalysis.js';
import { pluralize } from '../../lib/format.js';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';
import { Input } from '../ui/Input.jsx';

/**
 * «Отказ» лида — причина строго из фиксированного списка
 * (2026-08-13-leads-funnel-redesign.md §7). Для причин с
 * `requiresDetail` (см. LOST_REASON_OPTIONS) оператор обязан ещё
 * вписать, что именно случилось — без этого текста отказать нельзя.
 * `lead` = null (закрыто) или сущность.
 *
 * После сохранения — разбор отклонений от «идеальной картины» ведения
 * лида (leadDeviationAnalysis.js): не блокирует отказ (он уже сохранён),
 * просто показывает, где, возможно, разошлись со стандартом — гипотеза
 * оператору/менеджеру, не блокирующая проверка. Если отклонений нет
 * (нечего показать) — модалка просто закрывается, как раньше.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function DeclineLeadModal({ lead, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [reason, setReason] = useState(LOST_REASON_OPTIONS[0].value);
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // {fullName, items, totalPoints} | null

  const selectedOption = LOST_REASON_OPTIONS.find((o) => o.value === reason);
  const detailRequired = Boolean(selectedOption?.requiresDetail);

  const reset = () => {
    setReason(LOST_REASON_OPTIONS[0].value);
    setDetail('');
    setResult(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (detailRequired && !detail.trim()) return;
    setSaving(true);
    try {
      await advanceStage(
        db,
        lead,
        'lost',
        {
          statusReason: detailRequired ? `${selectedOption.label} — ${detail.trim()}` : (selectedOption?.label ?? reason),
          lostReason: reason,
          lostReasonDetail: detailRequired ? detail.trim() : null,
          lostAt: serverTimestamp(),
        },
        user,
      );
      showToast('Лид отклонён.');
      const { items, totalPoints } = analyzeLeadDeviations({ ...lead, lostReason: reason });
      if (items.length > 0) {
        setResult({ fullName: lead.fullName, items, totalPoints });
      } else {
        close();
      }
    } catch {
      showToast('Не удалось сохранить отказ.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <Modal open={Boolean(lead)} onClose={close} title={`Разбор отказа: ${result.fullName}`} footer={<Button onClick={close}>Понятно</Button>}>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">Возможно, отказ связан с отклонениями от стандарта ведения лида:</p>
          <ul className="flex flex-col gap-2">
            {result.items.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-3 rounded-field border border-border bg-surface-alt p-2.5 text-[13px] text-text">
                <span>{item.label}</span>
                <span className="shrink-0 font-bold text-danger">
                  {item.points} {pluralize(Math.abs(item.points), ['балл', 'балла', 'баллов'])}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-right text-[13px] font-bold text-text">
            Итого: {result.totalPoints} {pluralize(Math.abs(result.totalPoints), ['балл', 'балла', 'баллов'])}
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={Boolean(lead)}
      onClose={close}
      title={`Отказ: ${lead?.fullName ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving} disabled={detailRequired && !detail.trim()}>
            Отказать
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Select
          label="Причина"
          required
          options={LOST_REASON_OPTIONS}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setDetail('');
          }}
        />
        {detailRequired && (
          <Input
            label="Что именно случилось"
            required
            autoFocus
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Опишите причину своими словами"
          />
        )}
      </form>
    </Modal>
  );
}
