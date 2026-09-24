import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { ArrowRight } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useDoc } from '../hooks/useDoc.js';
import { Card } from '../components/ui/Card.jsx';
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

const TONE_CLASS = { danger: 'text-danger', success: 'text-success', muted: 'text-muted' };

/** Один сегмент внутри MetricGroup — крупное число + мелкая подпись. */
function MetricSegment({ value, label, tone, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex-1 text-center ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
    >
      <p className={`text-[26px] leading-[32px] ${TONE_CLASS[tone] ?? 'text-navy-num'}`}>{value}</p>
      <p className="mt-0.5 text-[12px] leading-[16px] text-muted">{label}</p>
    </Tag>
  );
}

/** Тонкая вертикальная граница между сегментами одной группы — без причинности между ними. */
function MetricDivider() {
  return <div className="mx-1 w-px self-stretch bg-border" aria-hidden="true" />;
}

/** Стрелка между сегментами, где второй — следствие первого (план → факт). */
function MetricArrow() {
  return <ArrowRight className="mx-2 h-4 w-4 shrink-0 self-center text-muted" aria-hidden="true" />;
}

/** Бейдж процента конверсии, приклеенный к последнему сегменту группы. */
function PercentBadge({ value }) {
  return <span className="ml-2 shrink-0 rounded-full bg-navy/10 px-2.5 py-1 text-[12px] font-bold text-navy">{value}%</span>;
}

/** Карточка группы связанных метрик — заголовок + ряд сегментов. */
function MetricGroup({ title, children }) {
  return (
    <div className="flex flex-col rounded-card border border-border-strong bg-card p-4 shadow-card">
      <p className="mb-3 text-[12px] text-muted">{title}</p>
      <div className="flex items-center justify-center">{children}</div>
    </div>
  );
}

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

  const netGrowth = (stats?.newStudents ?? 0) - (stats?.leftActiveGroup ?? 0);
  const trialTodayPct =
    stats?.trialToday?.planned > 0 ? Math.round(((stats.trialToday.came ?? 0) / stats.trialToday.planned) * 100) : null;

  return (
    <>
      {!stats && !statsLoading ? (
        <div className="flex items-center justify-between gap-3 rounded-card border border-border-strong bg-card p-4 text-[14px] text-muted">
          <span>Цифры дашборда ещё не посчитаны — Apps Script считает их раз в час.</span>
        </div>
      ) : !stats ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-card" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <MetricGroup title="Ученики">
              <MetricSegment
                value={stats.activeStudents}
                label="активные"
                onClick={() => navigate('/students?section=all&allView=list&status=active')}
              />
              <MetricDivider />
              <MetricSegment value={stats.paidThisMonth} label="оплатили" onClick={() => navigate('/payments')} />
              <MetricDivider />
              <MetricSegment
                value={stats.debtors}
                label="должники"
                tone="danger"
                onClick={() => navigate('/students?section=debtors')}
              />
            </MetricGroup>

            <MetricGroup title="Движение">
              <MetricSegment
                value={`−${stats.leftActiveGroup}`}
                label="ушли"
                tone="danger"
                onClick={() => navigate('/students?section=left')}
              />
              <MetricArrow />
              <MetricSegment value={`+${stats.newStudents ?? 0}`} label="добавились" tone="success" />
              <MetricDivider />
              <MetricSegment value={`${netGrowth >= 0 ? '+' : ''}${netGrowth}`} label="чистый рост" />
            </MetricGroup>

            <MetricGroup title="Пробный сегодня">
              <MetricSegment value={stats.trialToday?.planned ?? 0} label="планировали" tone="muted" />
              <MetricArrow />
              <MetricSegment value={stats.trialToday?.came ?? 0} label="пришли" />
              {trialTodayPct !== null && <PercentBadge value={trialTodayPct} />}
            </MetricGroup>

            <MetricGroup title="Пробные за месяц">
              <MetricSegment value={stats.trialMonth?.total ?? 0} label="было пробных" tone="muted" />
              <MetricArrow />
              <MetricSegment value={`${stats.trialMonth?.retainedPct ?? 0}%`} label="остались" tone="success" />
            </MetricGroup>
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
