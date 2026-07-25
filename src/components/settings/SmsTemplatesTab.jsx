import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { Input } from '../ui/Input.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

/**
 * Настройки → Шаблоны SMS. Хранятся в `settings/{branchId}.smsTemplates`
 * (раздел 02). Реальной рассылки/шлюза нет (раздел 00 запрещает платёжные и
 * прочие внешние интеграции сверх оговорённого) — «отправка» из карточки
 * группы пишет `smsLogs`, это фиксация факта, не настоящая доставка.
 */
export function SmsTemplatesTab() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settings, loading } = useDoc(settingsRef);

  const [templates, setTemplates] = useState([]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');

  useEffect(() => {
    setTemplates(settings?.smsTemplates ?? []);
  }, [settings]);

  const save = async (next) => {
    setTemplates(next);
    try {
      await setDoc(settingsRef, { smsTemplates: next, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
    } catch {
      showToast('Не удалось сохранить шаблон.', { type: 'error' });
    }
  };

  const add = () => {
    if (!name.trim() || !text.trim()) return;
    save([...templates, { id: `tpl_${Date.now()}`, name: name.trim(), text: text.trim() }]);
    setName('');
    setText('');
  };

  const remove = (id) => save(templates.filter((t) => t.id !== id));

  if (loading || !settingsRef) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
        <Input placeholder="Название шаблона" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Текст SMS" value={text} onChange={(e) => setText(e.target.value)} />
        <Button onClick={add} disabled={!name.trim() || !text.trim()}>
          <Plus className="h-4 w-4" /> Добавить
        </Button>
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={MessageSquare} title="Пока нет шаблонов" />
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-row bg-surface-alt px-4 py-3">
              <div>
                <p className="font-bold text-text">{t.name}</p>
                <p className="text-[13px] text-muted">{t.text}</p>
              </div>
              <Button variant="icon-round" tone="danger" onClick={() => remove(t.id)} aria-label="Удалить">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
