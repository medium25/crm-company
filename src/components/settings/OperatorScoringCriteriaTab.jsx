import { useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Pencil } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useRole } from '../../hooks/useRole.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { Input } from '../ui/Input.jsx';
import { Button } from '../ui/Button.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { DEFAULT_OPERATOR_SCORE_CRITERIA, CRITERIA_FIELDS } from '../../lib/operatorScoring.js';

/**
 * Пороги зелёный/жёлтый/красный для «Отчёты и статистика → Статистика →
 * Отдел продаж» — хранятся в settings/{branchId}.operatorScoreCriteria.
 * Смотреть могут все, кто дошёл до вкладки (тот же route-gate, что у
 * остального «Настройки» — ceo/manager/admin), редактировать — только
 * ceo/manager, по явному требованию (не admin).
 */
export function OperatorScoringCriteriaTab() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { hasRole } = useRole();
  const { showToast } = useToast();
  const canEdit = hasRole('ceo', 'manager');

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settingsDoc, loading } = useDoc(settingsRef);
  const criteria = settingsDoc?.operatorScoreCriteria ?? DEFAULT_OPERATOR_SCORE_CRITERIA;

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setForm(structuredClone(criteria));
    setEditing(true);
  };

  if (loading) return <Skeleton className="h-64 w-full max-w-2xl" />;

  const setThreshold = (key, level, value) => {
    setForm((f) => ({ ...f, [key]: { ...f[key], [level]: Number(value) } }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(settingsRef, { operatorScoreCriteria: form, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
      showToast('Критерии сохранены.');
      setEditing(false);
    } catch {
      showToast('Не удалось сохранить критерии.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-2xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[17px] font-bold text-text">Оценка операторов</h2>
        {canEdit && !editing && (
          <Button variant="secondary" onClick={startEditing}>
            <Pencil className="h-4 w-4" /> Редактировать
          </Button>
        )}
      </div>
      <p className="mb-5 text-[13px] text-muted">
        Пороги, по которым «Статистика → Отдел продаж» красит воронку и просрочку зелёным/жёлтым/красным.
        {!canEdit && ' Редактируют менеджер и CEO.'}
      </p>

      {!editing ? (
        <div className="flex flex-col gap-2.5">
          {CRITERIA_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center justify-between border-b border-border pb-2.5 text-[14px] last:border-0 last:pb-0">
              <span className="text-text">{f.label}</span>
              <span className="text-muted">
                {f.invert ? (
                  <>
                    зелёный ≤ <b className="text-text">{criteria[f.key].green}</b> · жёлтый ≤ <b className="text-text">{criteria[f.key].yellow}</b> · иначе красный
                  </>
                ) : (
                  <>
                    зелёный ≥ <b className="text-text">{criteria[f.key].green}</b> · жёлтый ≥ <b className="text-text">{criteria[f.key].yellow}</b> · иначе красный
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {CRITERIA_FIELDS.map((f) => (
            <div key={f.key} className="grid grid-cols-[1fr_100px_100px] items-center gap-3">
              <span className="text-[13px] font-bold text-text">{f.label}</span>
              <Input type="number" value={form[f.key].green} onChange={(e) => setThreshold(f.key, 'green', e.target.value)} placeholder="зелёный" />
              <Input type="number" value={form[f.key].yellow} onChange={(e) => setThreshold(f.key, 'yellow', e.target.value)} placeholder="жёлтый" />
            </div>
          ))}
          <div className="mt-2 flex gap-2">
            <Button onClick={handleSave} loading={saving}>
              Сохранить
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
