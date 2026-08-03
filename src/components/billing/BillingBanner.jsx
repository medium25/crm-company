import { useMemo, useState } from 'react';
import { doc } from 'firebase/firestore';
import { format } from 'date-fns';
import { CircleDollarSign } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useDoc } from '../../hooks/useDoc.js';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { billingRunId, runMonthlyBilling } from '../../lib/billing.js';
import { formatMoney, formatMonth } from '../../lib/format.js';

/**
 * Баннер месячного начисления в топбаре — «03 · Бизнес-логика» §3.4.
 * Виден только ceo/manager/admin, только с 1-го числа месяца, только пока
 * биллинг-ран за этот месяц ещё не `done`.
 */
export function BillingBanner() {
  const { user, staff } = useAuth();
  const { isAdmin } = useRole();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);

  const month = format(new Date(), 'yyyy-MM');
  const runRef = useMemo(
    () => (db && activeBranchId ? doc(db, 'billingRuns', billingRunId(activeBranchId, month)) : null),
    [activeBranchId, month],
  );
  const { data: run, loading } = useDoc(runRef);

  const canRun = isAdmin;

  if (!canRun || loading || run?.status === 'done' || !activeBranchId) {
    return null;
  }

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runMonthlyBilling(db, activeBranchId, { uid: user.uid, fullName: staff?.fullName ?? '' });
      if (result.skipped) {
        showToast('Уже начислено за этот месяц.');
      } else {
        showToast(`Начислено ${result.processed} студентам на ${formatMoney(result.totalAmount)}.`);
      }
    } catch {
      showToast('Не удалось выполнить начисление.', { type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-full bg-orange-soft px-4 py-1.5 text-[13px] text-navy">
      <CircleDollarSign className="h-4 w-4 text-orange" />
      <span>Начислить за {formatMonth(month)}</span>
      <Button size="md" className="h-7 px-3 text-[13px]" onClick={handleRun} loading={running}>
        Начислить
      </Button>
    </div>
  );
}
