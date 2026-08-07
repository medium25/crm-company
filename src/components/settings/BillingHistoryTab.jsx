import { useMemo, useState } from 'react';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { format } from 'date-fns';
import { CircleDollarSign } from 'lucide-react';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useRole } from '../../hooks/useRole.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Card } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { runMonthlyBilling } from '../../lib/billing.js';
import { formatDateTime, formatMoney, formatMonth } from '../../lib/format.js';

const STATUS_BADGE = {
  done: { variant: 'status-active', label: 'Готово' },
  running: { variant: 'type-system', label: 'Выполняется' },
};

/**
 * Настройки → Биллинг: история запусков `billingRuns` + ручной запуск (тот
 * же `runMonthlyBilling`, что и баннер в топбаре — идемпотентно, повторный
 * клик за уже начисленный месяц ничего не создаёт).
 */
export function BillingHistoryTab() {
  const { user, staff } = useAuth();
  const { role } = useRole();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const canRun = role === 'ceo' || role === 'manager';

  const runsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'billingRuns'), where('branchId', '==', activeBranchId), orderBy('month', 'desc')) : null),
    [activeBranchId],
  );
  const { data: sortedRuns, loading } = useCollection(runsQuery);

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await runMonthlyBilling(db, activeBranchId, { uid: user.uid, fullName: staff?.fullName ?? '' });
      showToast(result.skipped ? 'Уже начислено за этот месяц.' : `Начислено ${result.processed} студентам на ${formatMoney(result.totalAmount)}.`);
      setConfirming(false);
    } catch {
      showToast('Не удалось выполнить начисление.', { type: 'error' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-text">История запусков</h3>
        {canRun && (
          <Button onClick={() => setConfirming(true)}>
            <CircleDollarSign className="h-4 w-4" /> Начислить сейчас
          </Button>
        )}
      </div>

      {loading && <Skeleton className="h-20 w-full" />}

      {!loading && sortedRuns.length === 0 && <EmptyState icon={CircleDollarSign} title="Начислений ещё не было" />}

      {!loading && sortedRuns.length > 0 && (
        <div className="flex flex-col gap-2">
          {sortedRuns.map((run) => (
            <div key={run.id} className="flex items-center justify-between rounded-row bg-surface-alt px-4 py-3 text-[15px]">
              <span className="text-text">{run.month}</span>
              <Badge variant={STATUS_BADGE[run.status]?.variant ?? 'type-system'}>{STATUS_BADGE[run.status]?.label ?? run.status}</Badge>
              <span className="text-muted">{run.processed ?? 0} записей</span>
              <span className="text-[13px] text-muted">{run.finishedAt ? formatDateTime(run.finishedAt) : '—'}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={handleRun}
        loading={running}
        title="Подтвердить начисление"
        message={`Начислить за ${formatMonth(format(new Date(), 'yyyy-MM'))} всем активным студентам филиала? Списания создадутся сразу и повторно не выполнятся.`}
        confirmLabel="Начислить"
      />
    </Card>
  );
}
