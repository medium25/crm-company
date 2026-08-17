import { useEffect, useMemo, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { TagListEditor } from './TagListEditor.jsx';
import { PAYMENT_METHOD_OPTIONS as PAYMENT_METHODS } from '../../lib/format.js';

const DEFAULT_TRIAL_TIME_SLOTS = ['09:00', '10:30', '14:00', '15:30', '17:00', '18:30', '20:00'];

/**
 * Настройки → Справочники: методы оплаты, источники лидов, причины ухода,
 * праздники — все живут в одном документе `settings/{branchId}` (раздел 02).
 */
export function DirectoriesTab() {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settings, loading } = useDoc(settingsRef);

  const [paymentMethods, setPaymentMethods] = useState([]);
  const [leadSources, setLeadSources] = useState([]);
  const [leaveReasons, setLeaveReasons] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [trialTimeSlots, setTrialTimeSlots] = useState([]);

  useEffect(() => {
    if (!settings) return;
    setPaymentMethods(settings.paymentMethods ?? PAYMENT_METHODS.map((m) => m.value));
    setLeadSources(settings.leadSources ?? []);
    setLeaveReasons(settings.leaveReasons ?? []);
    setHolidays(settings.holidays ?? []);
    setTrialTimeSlots(settings.trialTimeSlots ?? DEFAULT_TRIAL_TIME_SLOTS);
  }, [settings]);

  const save = async (patch) => {
    try {
      await setDoc(settingsRef, { ...patch, updatedAt: serverTimestamp(), updatedBy: user.uid }, { merge: true });
    } catch {
      showToast('Не удалось сохранить справочник.', { type: 'error' });
    }
  };

  const toggleMethod = (value) => {
    const next = paymentMethods.includes(value) ? paymentMethods.filter((m) => m !== value) : [...paymentMethods, value];
    setPaymentMethods(next);
    save({ paymentMethods: next });
  };

  if (loading || !settingsRef) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h3 className="mb-3 text-[15px] font-bold text-text">Методы оплаты</h3>
        <div className="flex flex-wrap gap-3">
          {PAYMENT_METHODS.map((m) => (
            <label key={m.value} className="flex items-center gap-2 text-[15px] text-text">
              <input type="checkbox" checked={paymentMethods.includes(m.value)} onChange={() => toggleMethod(m.value)} />
              {m.label}
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-[15px] font-bold text-text">Источники лидов</h3>
        <TagListEditor
          items={leadSources}
          onChange={(next) => {
            setLeadSources(next);
            save({ leadSources: next });
          }}
          placeholder="Instagram, Telegram…"
        />
      </Card>

      <Card>
        <h3 className="mb-3 text-[15px] font-bold text-text">Причины ухода</h3>
        <TagListEditor
          items={leaveReasons}
          onChange={(next) => {
            setLeaveReasons(next);
            save({ leaveReasons: next });
          }}
          placeholder="Переезд, цена…"
        />
      </Card>

      <Card>
        <h3 className="mb-3 text-[15px] font-bold text-text">Время пробных уроков</h3>
        <TagListEditor
          items={trialTimeSlots}
          onChange={(next) => {
            setTrialTimeSlots(next);
            save({ trialTimeSlots: next });
          }}
          placeholder="09:00"
        />
      </Card>

      <Card>
        <h3 className="mb-3 text-[15px] font-bold text-text">Праздники (даты без уроков)</h3>
        <TagListEditor
          items={holidays}
          onChange={(next) => {
            setHolidays(next);
            save({ holidays: next });
          }}
          placeholder="yyyy-MM-dd"
        />
      </Card>
    </div>
  );
}
