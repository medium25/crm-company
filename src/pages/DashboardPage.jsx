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
import { loadDashboardStats, getDailyRevenueComparison, getMonthlyRevenue, fetchDashboardPayments } from '../lib/stats.js';

/**
 * 6 KPI-карточек — переходы по клику из «04 · Экраны» §2. Формулы — «03 ·
 * Бизнес-логика» §5.
 *
 * Плитки и график грузятся независимо друг от друга: у каждого свой
 * индикатор, своя ошибка и «Повторить» — одна упавшая/зависшая выборка
 * больше не оставляет на серых заглушках весь дашборд. Последние цифры
 * кэшируются в браузере: страница показывает их сразу, а Firestore
 * опрашивается только если кэшу больше минуты (то есть повторные заходы
 * подряд не читают базу вовсе). Платежи месяца читаются один раз на обе
 * части, когда обновляются обе.
 */
const CACHE_TTL_MS = 60_000;
const LOAD_TIMEOUT_MS = 20_000;
const cacheKey = (branchId, churnPeriod) => `icon-crm:dashboard:${branchId}:${churnPeriod}`;

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(key, patch) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...(readCache(key) ?? {}), ...patch }));
  } catch {
    // нет localStorage / переполнен — просто без кэша
  }
}

// Зависший запрос не должен держать заглушки вечно — через 20 с показываем ошибку с «Повторить».
const withTimeout = (promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS))]);

function LoadError({ onRetry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-card border border-border-strong bg-card p-4 text-[14px] text-muted">
      <span>Не удалось загрузить данные.</span>
      <button type="button" onClick={onRetry} className="rounded-full bg-navy px-4 py-1.5 text-[13px] font-bold text-white hover:bg-navy-hover">
        Повторить
      </button>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: settings } = useDoc(settingsRef);
  const churnPeriod = settings?.churnPeriod ?? 'year';

  const [stats, setStats] = useState(null);
  const [chart, setChart] = useState(null); // { comparison, monthly }
  const [statsError, setStatsError] = useState(false);
  const [chartError, setChartError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!db || !activeBranchId) return undefined;
    const key = cacheKey(activeBranchId, churnPeriod);
    const cached = readCache(key);
    const forced = reloadKey > 0;
    const fresh = (at) => !forced && Date.now() - (at ?? 0) < CACHE_TTL_MS;
    const needStats = !(cached?.stats && fresh(cached.statsAt));
    const needChart = !(cached?.chart && fresh(cached.chartAt));

    setStats(cached?.stats ?? null);
    setChart(cached?.chart ?? null);
    setStatsError(false);
    setChartError(false);

    let cancelled = false;
    // Платежи — один запрос на обе части, только когда нужны обе (иначе плитка
    // читает лишь текущий месяц, как раньше — без лишних чтений).
    const shared = needStats && needChart ? fetchDashboardPayments(db, activeBranchId) : undefined;
    shared?.catch(() => {});

    if (needStats) {
      withTimeout(loadDashboardStats(db, activeBranchId, churnPeriod, shared))
        .then((s) => {
          if (cancelled) return;
          setStats(s);
          writeCache(key, { stats: s, statsAt: Date.now() });
        })
        .catch(() => {
          if (!cancelled) setStatsError(true);
        });
    }
    if (needChart) {
      withTimeout(Promise.all([getDailyRevenueComparison(db, activeBranchId, new Date(), shared), getMonthlyRevenue(db, activeBranchId)]))
        .then(([comparison, monthly]) => {
          if (cancelled) return;
          const next = { comparison, monthly: monthly.map(({ month, amount, paymentsCount }) => ({ month, amount, paymentsCount })) };
          setChart(next);
          writeCache(key, { chart: next, chartAt: Date.now() });
        })
        .catch(() => {
          if (!cancelled) setChartError(true);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [activeBranchId, churnPeriod, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

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

      {!stats && statsError ? (
        <LoadError onRetry={retry} />
      ) : !stats ? (
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
        {chart ? (
          <RevenueOverviewChart comparison={chart.comparison} monthly={chart.monthly} />
        ) : chartError ? (
          <LoadError onRetry={retry} />
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
