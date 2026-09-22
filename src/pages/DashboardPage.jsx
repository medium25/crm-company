import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { GraduationCap, AlertTriangle, Timer, Handshake, LogOut, UserX } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useDoc } from '../hooks/useDoc.js';
import { Card } from '../components/ui/Card.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { RevenueOverviewChart } from '../components/charts/RevenueOverviewChart.jsx';
import { RoomScheduleGrid } from '../components/dashboard/RoomScheduleGrid.jsx';
import { getMonthlyRevenue } from '../lib/stats.js';

/**
 * 6 KPI-плиток и график «Сравнение» — раньше страница сама на каждом заходе
 * читала enrollments/students/transactions (это и раздувало квоту чтений,
 * см. 2026-09-22: раздел «Дашборд» — 100 618 чтений из 148 026 за сутки).
 * Теперь эти 6 чисел и данные графика считает Apps Script раз в час, одним
 * запуском на весь филиал (appsscript/DashboardStats.gs), и кладёт в
 * `dashboardStats/{branchId}` — страница только ПОДПИСАНА на этот один
 * документ (useDoc — onSnapshot): 1 чтение на открытие + 1 на каждое
 * обновление документа, не больше ~17 раз в сутки (число реальных запусков
 * триггера в рабочие часы), сколько бы раз сотрудник ни заходил на дашборд.
 *
 * `monthlyRevenue` (годовой график) остаётся отдельным лёгким запросом —
 * это и раньше был предпосчитанный агрегат, трогать не нужно.
 *
 * Цифры на плитках свежие с точностью до часа (когда посчитал Apps Script),
 * не «прямо сейчас» — для дневных KPI этого достаточно, значение написано
 * рядом («обновлено N назад»).
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const statsRef = useMemo(() => (db && activeBranchId ? doc(db, 'dashboardStats', activeBranchId) : null), [activeBranchId]);
  const { data: stats, loading: statsLoading } = useDoc(statsRef);

  const [monthly, setMonthly] = useState(null);
  const [monthlyError, setMonthlyError] = useState(false);
  useEffect(() => {
    if (!db || !activeBranchId) return;
    let cancelled = false;
    getMonthlyRevenue(db, activeBranchId)
      .then((rows) => {
        if (!cancelled) setMonthly(rows.map(({ month, amount, paymentsCount }) => ({ month, amount, paymentsCount })));
      })
      .catch(() => {
        if (!cancelled) setMonthlyError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  const updatedAgo = useAgoLabel(stats?.updatedAt);

  const cards = stats
    ? [
        { icon: GraduationCap, label: 'Активные студенты', value: stats.activeStudents, to: '/students?section=all&allView=list&status=active' },
        { icon: Handshake, label: 'Оплатили в текущем месяце', value: stats.paidThisMonth, to: '/payments' },
        { icon: AlertTriangle, label: 'Должники', value: stats.debtors, to: '/students?section=debtors' },
        { icon: LogOut, label: 'Ушли из активной группы', value: stats.leftActiveGroup, to: '/students?section=left' },
        { icon: Timer, label: 'В пробном уроке', value: stats.trial, to: '/students?section=trial' },
        { icon: UserX, label: 'Ушли после пробного периода', value: stats.leftAfterTrial, to: '/students?section=left' },
      ]
    : [];

  return (
    <>
      {!stats && !statsLoading ? (
        <div className="flex items-center justify-between gap-3 rounded-card border border-border-strong bg-card p-4 text-[14px] text-muted">
          <span>Цифры дашборда ещё не посчитаны — Apps Script считает их раз в час.</span>
        </div>
      ) : !stats ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            {cards.map((c) => (
              <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} onClick={() => navigate(c.to)} />
            ))}
          </div>
          {updatedAgo && <p className="mt-2 text-[12px] text-muted">Обновлено {updatedAgo}</p>}
        </>
      )}

      <Card className="mt-6">
        {stats?.comparison ? (
          <RevenueOverviewChart comparison={stats.comparison} monthly={monthly ?? []} />
        ) : monthlyError ? (
          <div className="flex items-center justify-between gap-3 rounded-card border border-border-strong bg-card p-4 text-[14px] text-muted">
            <span>Не удалось загрузить график.</span>
          </div>
        ) : (
          <Skeleton className="h-64 w-full rounded-card" />
        )}
      </Card>

      <div className="mt-6">
        <RoomScheduleGrid branchId={activeBranchId} />
      </div>
    </>
  );
}

/** «5 минут назад» / «2 часа назад» по updatedAt документа dashboardStats — без лишней библиотеки. */
function useAgoLabel(timestamp) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!timestamp?.toDate) return null;
  const ms = Date.now() - timestamp.toDate().getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  return `${hours} ч назад`;
}
