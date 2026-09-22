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

const cacheKey = (branchId) => `icon-crm:dashboardStats:${branchId}`;

function readCache(branchId) {
  try {
    const raw = localStorage.getItem(cacheKey(branchId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(branchId, stats) {
  try {
    localStorage.setItem(
      cacheKey(branchId),
      JSON.stringify({ ...stats, updatedAt: stats.updatedAt?.toDate?.().toISOString() ?? null }),
    );
  } catch {
    // нет localStorage / переполнен — просто без запасных цифр на следующий заход
  }
}

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
 * Последние полученные от Apps Script цифры дублируются в localStorage —
 * пока подписка ещё не отдала свежий документ (первая загрузка страницы)
 * или пока триггер вообще ни разу не отработал после только что настроенной
 * интеграции, вместо пустого «Цифры ещё не посчитаны» показываются цифры
 * прошлого обновления с пометкой, что они могут быть устаревшими.
 *
 * `monthlyRevenue` (годовой график) остаётся отдельным лёгким запросом —
 * это и раньше был предпосчитанный агрегат, трогать не нужно.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const statsRef = useMemo(() => (db && activeBranchId ? doc(db, 'dashboardStats', activeBranchId) : null), [activeBranchId]);
  const { data: liveStats, loading: statsLoading } = useDoc(statsRef);

  // cachedStats — то, что показываем, пока не пришёл свежий документ: сразу при
  // смене филиала подхватывает то, что осталось с прошлого раза, а как только
  // liveStats приходит — обновляется и сам кэш, и то, что видно на экране.
  const [cachedStats, setCachedStats] = useState(() => (activeBranchId ? readCache(activeBranchId) : null));
  useEffect(() => {
    setCachedStats(activeBranchId ? readCache(activeBranchId) : null);
  }, [activeBranchId]);
  useEffect(() => {
    if (liveStats && activeBranchId) {
      writeCache(activeBranchId, liveStats);
      setCachedStats(liveStats);
    }
  }, [liveStats, activeBranchId]);

  const stats = liveStats ?? cachedStats;
  // Показанные цифры устарели, если это не то, что только что пришло по подписке
  // (либо это вообще кэш, либо подписка ещё грузится и мы показываем старое, пока ждём).
  const isStale = Boolean(stats) && !liveStats;

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

  const updatedAt = liveStats?.updatedAt?.toDate ? liveStats.updatedAt.toDate() : stats?.updatedAt ? new Date(stats.updatedAt) : null;
  const updatedAgo = useAgoLabel(updatedAt);

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
          {updatedAgo && (
            <p className="mt-2 text-[12px] text-muted">
              {isStale ? `Цифры последнего обновления (${updatedAgo}) — сейчас, возможно, устарели` : `Обновлено ${updatedAgo}`}
            </p>
          )}
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

/** «5 минут назад» / «2 часа назад» по дате последнего обновления — без лишней библиотеки. */
function useAgoLabel(date) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  return `${hours} ч назад`;
}
