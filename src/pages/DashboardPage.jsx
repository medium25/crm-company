import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { UserPlus, GraduationCap, Layers, AlertTriangle, Timer, Handshake, LogOut, UserX } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useDoc } from '../hooks/useDoc.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { StatCard } from '../components/ui/StatCard.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { RevenueChart } from '../components/charts/RevenueChart.jsx';
import { DebtorsList } from '../components/dashboard/DebtorsList.jsx';
import { TodayLessons } from '../components/dashboard/TodayLessons.jsx';
import { loadDashboardStats, getMonthlyRevenue } from '../lib/stats.js';

/**
 * 8 KPI-карточек — переходы по клику из «04 · Экраны» §2. Формулы — «03 ·
 * Бизнес-логика» §5.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settings } = useDoc(settingsRef);
  const churnPeriod = settings?.churnPeriod ?? 'year';

  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !activeBranchId) return undefined;
    let cancelled = false;
    setLoading(true);
    Promise.all([loadDashboardStats(db, activeBranchId, churnPeriod), getMonthlyRevenue(db, activeBranchId)])
      .then(([s, r]) => {
        if (cancelled) return;
        setStats(s);
        setRevenue(r);
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
        { icon: UserPlus, label: 'Активные лиды', value: stats.activeLeads, to: '/leads' },
        { icon: GraduationCap, label: 'Активные студенты', value: stats.activeStudents, to: '/students?status=active' },
        { icon: Layers, label: 'Группы', value: stats.activeGroups, to: '/groups?status=active' },
        { icon: AlertTriangle, label: 'Должники', value: stats.debtors, to: '/students?debtors=1' },
        { icon: Timer, label: 'В пробном уроке', value: stats.trial, to: '/students?status=trial' },
        { icon: Handshake, label: 'Оплатили в текущем месяце', value: stats.paidThisMonth, to: '/payments?period=current' },
        { icon: LogOut, label: 'Ушли из активной группы', value: stats.leftActiveGroup, to: '/students?status=left&from=group' },
        { icon: UserX, label: 'Ушли после пробного периода', value: stats.leftAfterTrial, to: '/students?status=left&from=trial' },
      ]
    : [];

  return (
    <>
      <PageHeader title="Дашборд" />

      {loading || !stats ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
          {cards.map((c) => (
            <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} onClick={() => navigate(c.to)} />
          ))}
        </div>
      )}

      <Card className="mt-6">
        <RevenueChart data={revenue} />
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DebtorsList branchId={activeBranchId} />
        <TodayLessons branchId={activeBranchId} />
      </div>
    </>
  );
}
