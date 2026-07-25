import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { Select } from '../ui/Select.jsx';

/**
 * Массовая SMS-рассылка — пишет `smsLogs` (раздел 02). Реального SMS-шлюза
 * нет и не будет (раздел 00), это фиксация факта рассылки по шаблону, как
 * решено уже в `SmsTemplatesTab`.
 * @param {Object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {Array<{studentId: string, studentName: string}>} props.recipients
 * @param {string} [props.groupId]
 * @param {string} props.branchId
 */
export function SmsSendModal({ open, onClose, recipients, groupId = null, branchId }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const settingsRef = useMemo(() => (db && branchId ? doc(db, 'settings', branchId) : null), [branchId]);
  const { data: settings } = useDoc(settingsRef);
  const templates = settings?.smsTemplates ?? [];

  const [templateId, setTemplateId] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setTemplateId('');
      setText('');
    }
  }, [open]);

  const applyTemplate = (id) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (tpl) setText(tpl.text);
  };

  const handleSend = async () => {
    if (!text.trim() || recipients.length === 0) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'smsLogs'), {
        branchId,
        studentIds: recipients.map((r) => r.studentId),
        groupId,
        text: text.trim(),
        status: 'sent',
        sentBy: user.uid,
        createdAt: serverTimestamp(),
      });
      showToast(`SMS отправлено: ${recipients.length}.`);
      onClose();
    } catch {
      showToast('Не удалось отправить SMS.', { type: 'error' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Отправить SMS"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={handleSend} loading={sending} disabled={!text.trim() || recipients.length === 0}>
            Отправить ({recipients.length})
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">
          Получатели: {recipients.length === 0 ? 'нет' : recipients.map((r) => r.studentName).join(', ')}
        </p>
        {templates.length > 0 && (
          <Select
            label="Шаблон"
            options={[{ value: '', label: 'Свой текст' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
            value={templateId}
            onChange={(e) => applyTemplate(e.target.value)}
          />
        )}
        <div>
          <label className="mb-1 block text-[13px] text-muted">Текст SMS</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="w-full rounded-field border border-border-strong px-3 py-2 text-[15px] text-text focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/15"
          />
        </div>
      </div>
    </Modal>
  );
}
