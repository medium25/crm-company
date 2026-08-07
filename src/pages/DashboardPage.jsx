import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { GraduationCap, AlertTriangle, Timer, Handshake, LogOut, UserX } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useDoc } from '../hooks/useDoc.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { RevenueOverviewChart } from '../components/charts/RevenueOverviewChart.jsx';
import { RoomScheduleGrid } from '../components/dashboard/RoomScheduleGrid.jsx';
import { loadDashboardStats, getDailyRevenueComparison, getMonthlyRevenue } from '../lib/stats.js';

/**
 * 6 KPI-карточек — переходы по клику из «04 · Экраны» §2. Формулы — «03 ·
 * Бизнес-логика» §5.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settings } = useDoc(settingsRef);
  const churnPeriod = settings?.churnPeriod ?? 'year';

  const [stats, setStats] = useState(null);
  const [revenueComparison, setRevenueComparison] = useState(null);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !activeBranchId) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      loadDashboardStats(db, activeBranchId, churnPeriod),
      getDailyRevenueComparison(db, activeBranchId),
      getMonthlyRevenue(db, activeBranchId),
    ])
      .then(([s, r, m]) => {
        if (cancelled) return;
        setStats(s);
        setRevenueComparison(r);
        setMonthlyRevenue(m);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBranchId, churnPeriod]);

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
      <PageHeader title="Дашборд" />

      {loading || !stats ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {cards.map((c) => (
            <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} onClick={() => navigate(c.to)} />
          ))}
        </div>
      )}

      <Card className="mt-6">
        {revenueComparison && <RevenueOverviewChart comparison={revenueComparison} monthly={monthlyRevenue} />}
      </Card>

      <div className="mt-6">
        <RoomScheduleGrid branchId={activeBranchId} />
      </div>
    </>
  );
}
