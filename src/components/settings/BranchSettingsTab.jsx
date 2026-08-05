import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { Input } from '../ui/Input.jsx';
import { Select } from '../ui/Select.jsx';
import { Button } from '../ui/Button.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

const CHURN_PERIOD_OPTIONS = [
  { value: 'month', label: 'Месяц' },
  { value: 'quarter', label: 'Квартал' },
  { value: 'year', label: 'Год' },
];

export function BranchSettingsTab() {
  const { user } = useAuth();
  const { activeBranch, activeBranchId, loading: branchLoading } = useBranch();
  const { showToast } = useToast();
  const settingsRef = useMemo(
    () => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null),
    [activeBranchId],
  );
  const { data: settingsDoc, loading: settingsLoading } = useDoc(settingsRef);

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeBranch) return;
    setForm({
      name: activeBranch.name ?? '',
      address: activeBranch.address ?? '',
      phone: activeBranch.phone ?? '',
      lessonsPerMonth: String(activeBranch.lessonsPerMonth ?? 12),
      churnPeriod: settingsDoc?.churnPeriod ?? 'year',
    });
  }, [activeBranch, settingsDoc]);

  if (branchLoading || settingsLoading || !form) {
    return <Skeleton className="h-64 w-full max-w-xl" />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'branches', activeBranchId), {
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.replace(/\D/g, ''),
        lessonsPerMonth: Number(form.lessonsPerMonth),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      });
      await setDoc(
        doc(db, 'settings', activeBranchId),
        { churnPeriod: form.churnPeriod, updatedAt: serverTimestamp(), updatedBy: user.uid },
        { merge: true },
      );
      showToast('Настройки филиала сохранены.');
    } catch {
      showToast('Не удалось сохранить настройки.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Название"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <Input
          label="Адрес"
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
        <Input
          label="Телефон"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
        />
        <Input
          label="Уроков в месяц (база для расчёта цены урока)"
          type="number"
          min="1"
          required
          value={form.lessonsPerMonth}
          onChange={(e) => setForm((f) => ({ ...f, lessonsPerMonth: e.target.value }))}
        />
        <Select
          label="Период оттока (для KPI дашборда)"
          options={CHURN_PERIOD_OPTIONS}
          value={form.churnPeriod}
          onChange={(e) => setForm((f) => ({ ...f, churnPeriod: e.target.value }))}
        />
        <Button type="submit" loading={saving} className="self-start">
          Сохранить
        </Button>
      </form>
    </Card>
  );
}
