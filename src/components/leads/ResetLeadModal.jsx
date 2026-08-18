import { useEffect, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Input } from '../ui/Input.jsx';

const ACCESS_CODE = '1223';

/**
 * «Вернуть в новый лид» — полный сброс воронки на месте (без создания
 * нового документа): стадия обратно в 'new', обнуляются все поля прогресса
 * (попытки дозвона, пробный, дожим, причина отказа...). Финансовая история
 * (paidAt/firstPaymentAt/balance, коллекция transactions) не трогается —
 * это реальные факты оплаты, а не прогресс по воронке. Действие спрятано
 * за кодом доступа — не настоящая защита, просто защита от случайного клика.
 * @param {Object} props
 * @param {Object|null} props.lead
 * @param {() => void} props.onClose
 */
export function ResetLeadModal({ lead, onClose }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (lead) {
      setCode('');
      setError('');
    }
  }, [lead]);

  if (!lead) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code !== ACCESS_CODE) {
      setError('Неверный код доступа.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'students', lead.id), {
        funnelStage: 'new',
        status: 'lead',
        stageHistory: [{ stage: 'new', enteredAt: new Date() }],
        createdAt: serverTimestamp(),
        callAttempts: [],
        nextCallDueAt: null,
        trialAt: null,
        trialDate: null,
        trialCourseId: null,
        trialCourseName: null,
        trialConfirmDueAt: null,
        trialConfirmAttempts: [],
        attended: false,
        engagementScore: null,
        unreachableAttempts: [],
        unreachableNextCallDueAt: null,
        callReminderDone: false,
        telegramReminderSent: false,
        rescheduleCount: 0,
        closingTouchNumber: 0,
        nextTouchAt: null,
        lostReason: null,
        lostReasonDetail: null,
        lostAt: null,
        statusReason: null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      showToast(`${lead.fullName}: возвращён в «Новый лид».`);
      onClose();
    } catch {
      showToast('Не удалось сбросить лида.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(lead)}
      onClose={onClose}
      title={`Вернуть в новый лид: ${lead.fullName}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={saving}>
            Сбросить
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-[13px] text-danger">
          Весь прогресс по карточке удалится — попытки дозвона, пробный, дожим, причина отказа. Лид станет как новый.
          Финансовая история (оплаты) не затрагивается.
        </p>
        <Input
          label="Код доступа"
          type="password"
          required
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError('');
          }}
          error={error}
        />
      </form>
    </Modal>
  );
}
