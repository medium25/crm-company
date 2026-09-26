import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowRight, ChevronDown, RefreshCw } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useDoc } from '../hooks/useDoc.js';
import { useCollection } from '../hooks/useCollection.js';
import { useToast } from '../components/ui/Toast.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { RevenueOverviewChart } from '../components/charts/RevenueOverviewChart.jsx';
import { RoomScheduleGrid } from '../components/dashboard/RoomScheduleGrid.jsx';
import { TrialsMonthChart } from '../components/charts/TrialsMonthChart.jsx';
import {
  getMonthlyRevenue,
  churnPeriodRange,
  countTrialToday,
  countTrialMonthRetention,
  countNewStudents,
  loadDashboardStats,
  fetchDashboardPayments,
  getDailyRevenueComparison,
} from '../lib/stats.js';
import { newStudentsBreakdown, leftActiveGroupByTeacher, trialTodayByOperator, trialMonthBreakdown, trialMonthByTeacher } from '../lib/reports.js';
import { formatSource } from '../lib/format.js';

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

const TONE_TEXT = { danger: 'text-danger', success: 'text-success', muted: 'text-muted' };
const ROLE_SUFFIX_LABEL = { operator: 'оператор', admin: 'администратор' };
const TONE_BG = { danger: 'bg-danger/10', success: 'bg-success/10', muted: 'bg-muted/10' };
// Раскрытая разбивка окрашивается в тон того сегмента, чью стрелку нажали —
// чтобы было видно, к какому именно числу относятся эти «По операторам».
const TONE_BAR = { danger: 'bg-danger', success: 'bg-success', muted: 'bg-muted', navy: 'bg-navy' };

/** Один сегмент внутри MetricGroup — своя подложка + крупное число + подпись (с процентом и стрелкой «подробнее» на одной строке). */
function MetricSegment({ value, label, percent, tone, onClick, detailsOpen, onToggleDetails }) {
  const toneText = TONE_TEXT[tone] ?? 'text-navy-num';
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={`flex-1 rounded-xl px-3 py-3 text-center ${TONE_BG[tone] ?? 'bg-navy/5'} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
    >
      <p className={`text-[28px] font-bold leading-[34px] tracking-tight ${toneText}`}>{value}</p>
      <div className="mt-1 flex items-center justify-center gap-1">
        <span className="text-[12.5px] leading-[16px] text-muted">
          {label}
          {percent != null && <span className={`ml-1 font-semibold ${toneText}`}>{percent}%</span>}
        </span>
        {onToggleDetails && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDetails();
            }}
            aria-label="Подробнее"
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted hover:bg-black/5 hover:text-navy"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Стрелка между сегментами, где второй — следствие первого (план → факт). */
function MetricArrow() {
  return <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted" aria-hidden="true" />;
}

/** Карточка группы связанных метрик — просто ряд сегментов, без заголовка. */
function MetricGroup({ children }) {
  return (
    <div className="flex h-full items-stretch justify-center gap-2 rounded-card border border-border-strong bg-card p-4 shadow-card">
      {children}
    </div>
  );
}

/**
 * Раскрывающаяся разбивка под MetricGroup — секции «По операторам»/«По
 * источникам»/«По учителям». Верхняя граница и подписи секций красятся в тон
 * сегмента, чью стрелку нажали (state.tone) — видно, к какому числу это
 * относится. Под каждой строкой — мини-полоса того же тона: длина `barValue`
 * относительно максимума в своей секции (сравнение соседей), не абсолютная
 * величина.
 */
function DetailPanel({ state }) {
  if (!state?.open) return null;
  const tone = state.tone ?? 'navy';
  if (state.loading) {
    return <div className="rounded-card border border-border-strong bg-card p-3 text-[12px] text-muted">Загрузка…</div>;
  }
  if (state.error) {
    return <div className="rounded-card border border-border-strong bg-card p-3 text-[12px] text-danger">Не удалось загрузить.</div>;
  }
  const sections = state.sections ?? [];
  if (!sections.some((s) => s.chart || s.rows.length > 0)) {
    return <div className="rounded-card border border-border-strong bg-card p-3 text-[12px] text-muted">Нет данных за период.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 rounded-card border border-border-strong bg-card p-3 sm:grid-cols-2">
      {sections.map((s) => {
        // Секция-график — на всю ширину панели, над разбивкой.
        if (s.chart) {
          return (
            <div key={s.title} className="sm:col-span-2">
              <p className={`mb-2 text-[11px] font-semibold ${TONE_TEXT[tone] ?? 'text-navy'}`}>{s.title}</p>
              {s.chart}
            </div>
          );
        }
        const max = Math.max(1, ...s.rows.map((r) => r.barValue ?? 0));
        return (
          <div key={s.title}>
            <p className={`mb-2 text-[11px] font-semibold ${TONE_TEXT[tone] ?? 'text-navy'}`}>{s.title}</p>
            <div className="flex flex-col gap-2.5">
              {s.rows.map((r) => (
                <div key={r.label}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-navy-num">{r.label}</span>
                    <span className="shrink-0 font-semibold">{r.display}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted/10">
                    <div
                      className={`h-full rounded-full ${TONE_BAR[tone] ?? TONE_BAR.navy}`}
                      style={{ width: `${Math.round(((r.barValue ?? 0) / max) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();

  const statsRef = useMemo(() => (db && activeBranchId ? doc(db, 'dashboardStats', activeBranchId) : null), [activeBranchId]);
  const { data: liveStats, loading: statsLoading } = useDoc(statsRef);

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: branchSettings } = useDoc(settingsRef);
  const churnPeriod = branchSettings?.churnPeriod ?? 'year';

  // Ручное обновление — та же формула, что и часовой Apps Script триггер
  // (loadDashboardStats/getDailyRevenueComparison из stats.js — канонический
  // источник, который DashboardStats.gs копирует), просто по клику, а не по
  // расписанию. Нужно на случай простоя (пробел ночью 23:00–7:00, см.
  // 2026-09-25) или пока триггер ждёт своего часа.
  const [refreshing, setRefreshing] = useState(false);
  const manualRefresh = async () => {
    if (!db || !activeBranchId || refreshing) return;
    setRefreshing(true);
    try {
      const payments = fetchDashboardPayments(db, activeBranchId);
      const [freshStats, comparison] = await Promise.all([
        loadDashboardStats(db, activeBranchId, churnPeriod, payments),
        getDailyRevenueComparison(db, activeBranchId, new Date(), payments),
      ]);
      await setDoc(doc(db, 'dashboardStats', activeBranchId), { ...freshStats, comparison, updatedAt: serverTimestamp() }, { merge: true });
      showToast('Дашборд обновлён.');
    } catch {
      showToast('Не удалось обновить дашборд.', { type: 'error' });
    } finally {
      setRefreshing(false);
    }
  };

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const operatorName = useMemo(() => {
    const map = new Map(staffList.map((s) => [s.id, s.fullName]));
    return (key) => {
      if (key === 'unassigned') return 'Без оператора';
      const [id, role] = key.split('::');
      const name = map.get(id) ?? id;
      return role ? `${name} (${ROLE_SUFFIX_LABEL[role] ?? role})` : name;
    };
  }, [staffList]);

  // details — по одному состоянию {open, loading, error, sections} на каждый
  // раскрываемый сегмент (paid/left/trialToday/trialTotal/trialRetained).
  // Разбивка читается вживую по клику (не из dashboardStats — та считает
  // только 6 верхнеуровневых чисел раз в час), поэтому кэшируется в памяти
  // на время сессии — повторный клик просто открывает/закрывает панель.
  const [details, setDetails] = useState({});
  const toggleDetail = (key, loader, tone = 'navy') => {
    const cur = details[key];
    const willOpen = !cur?.open;
    setDetails((prev) => ({ ...prev, [key]: { ...prev[key], open: willOpen, tone, loading: willOpen && !cur?.sections, error: false } }));
    if (!willOpen || cur?.sections) return;
    loader()
      .then((sections) => setDetails((prev) => ({ ...prev, [key]: { ...prev[key], loading: false, sections } })))
      .catch(() => setDetails((prev) => ({ ...prev, [key]: { ...prev[key], loading: false, error: true } })));
  };

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

  // newStudents/trialToday/trialMonth появились в dashboardStats позже остальных
  // полей — пока их не подставили в живой Apps Script и он не пересчитал документ
  // заново, эти поля в уже существующем документе просто отсутствуют (не 0, а
  // undefined). Чтобы не показывать нули вместо реальных цифр, недостающие поля
  // на этот случай досчитываются прямо в браузере той же формулой из stats.js —
  // один раз за сессию, только пока Apps Script не обновлён.
  const [liveFallback, setLiveFallback] = useState({});
  useEffect(() => {
    if (!db || !activeBranchId || !stats) return;
    if (stats.trialToday === undefined) {
      countTrialToday(db, activeBranchId).then((v) => setLiveFallback((prev) => ({ ...prev, trialToday: v })));
    }
    if (stats.trialMonth === undefined) {
      countTrialMonthRetention(db, activeBranchId).then((v) => setLiveFallback((prev) => ({ ...prev, trialMonth: v })));
    }
    if (stats.newStudents === undefined) {
      const { start, end } = churnPeriodRange(churnPeriod);
      countNewStudents(db, activeBranchId, start, end).then((v) => setLiveFallback((prev) => ({ ...prev, newStudents: v })));
    }
  }, [activeBranchId, stats, churnPeriod]);
  const effectiveTrialToday = stats?.trialToday ?? liveFallback.trialToday;
  const effectiveTrialMonth = stats?.trialMonth ?? liveFallback.trialMonth;
  const effectiveNewStudents = stats?.newStudents ?? liveFallback.newStudents;

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

  const netGrowth = (effectiveNewStudents ?? 0) - (stats?.leftActiveGroup ?? 0);
  const trialTodayPct =
    effectiveTrialToday?.planned > 0 ? Math.round(((effectiveTrialToday.came ?? 0) / effectiveTrialToday.planned) * 100) : null;
  const paidPct =
    stats?.activeStudents > 0 ? Math.round(((stats.paidThisMonth ?? 0) / stats.activeStudents) * 100) : null;
  const debtorPct =
    stats?.activeStudents > 0 ? Math.round(((stats.debtors ?? 0) / stats.activeStudents) * 100) : null;
  const netGrowthLabel = netGrowth > 0 ? 'чистый рост' : netGrowth < 0 ? 'падение' : 'точка безубыточности';
  const netGrowthTone = netGrowth > 0 ? 'success' : netGrowth < 0 ? 'danger' : 'muted';
  const currentMonthName = format(new Date(), 'LLLL', { locale: ru });

  const operatorSourceSections = ({ byOperator, bySource }) => [
    {
      title: 'По операторам',
      rows: byOperator.map(({ key, count }) => ({ label: operatorName(key), display: String(count), barValue: count })),
    },
    {
      title: 'По источникам',
      rows: bySource.map(({ key, count }) => ({
        label: key === 'none' ? 'Не указан' : (formatSource(key) ?? key),
        display: String(count),
        barValue: count,
      })),
    },
  ];

  const loadLeftDetails = () => {
    const { start, end } = churnPeriodRange(churnPeriod);
    return leftActiveGroupByTeacher(db, activeBranchId, start, end).then((rows) => [
      { title: 'По учителям', rows: rows.map(({ teacherName, count }) => ({ label: teacherName, display: String(count), barValue: count })) },
    ]);
  };

  const loadAddedDetails = () => {
    const { start, end } = churnPeriodRange(churnPeriod);
    return newStudentsBreakdown(db, activeBranchId, start, end).then(operatorSourceSections);
  };

  const loadTrialTodayDetails = () =>
    trialTodayByOperator(db, activeBranchId).then((rows) => [
      {
        title: 'По операторам (планировали → пришли)',
        rows: rows.map(({ operatorId, planned, came }) => ({ label: operatorName(operatorId), display: `${planned} → ${came}`, barValue: planned })),
      },
    ]);

  const loadTrialMonthDetails = () =>
    trialMonthBreakdown(db, activeBranchId).then((res) => [
      { title: `Пробные по дням, ${currentMonthName}`, chart: <TrialsMonthChart data={res.byDay} monthLabel={format(new Date(), 'LLLL', { locale: ru })} /> },
      ...operatorSourceSections(res),
    ]);

  const loadTrialRetainedDetails = () =>
    trialMonthByTeacher(db, activeBranchId).then((rows) => [
      {
        title: 'По учителям (дали → осталось → конверсия)',
        rows: rows.map(({ teacherName, total, retained, retainedPct }) => ({
          label: teacherName,
          display: `${total} → ${retained} → ${retainedPct}%`,
          barValue: retainedPct,
        })),
      },
    ]);

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
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-2">
              <MetricGroup>
                <MetricSegment
                  value={stats.activeStudents}
                  label="активные"
                  onClick={() => navigate('/students?section=all&allView=list&status=active')}
                />
                <MetricSegment
                  value={stats.paidThisMonth}
                  label="оплатили"
                  percent={paidPct}
                  onClick={() => navigate('/payments')}
                />
                <MetricSegment
                  value={stats.debtors}
                  label="должники"
                  percent={debtorPct}
                  tone="danger"
                  onClick={() => navigate('/students?section=debtors')}
                />
              </MetricGroup>
            </div>

            <div className="flex flex-col gap-2">
              <MetricGroup>
                <MetricSegment
                  value={`−${stats.leftActiveGroup}`}
                  label="ушли"
                  tone="danger"
                  onClick={() => navigate('/students?section=left')}
                  detailsOpen={details.left?.open}
                  onToggleDetails={() => toggleDetail('left', loadLeftDetails, 'danger')}
                />
                <MetricArrow />
                <MetricSegment
                  value={`+${effectiveNewStudents ?? 0}`}
                  label="добавились"
                  tone="success"
                  detailsOpen={details.added?.open}
                  onToggleDetails={() => toggleDetail('added', loadAddedDetails, 'success')}
                />
                <MetricArrow />
                <MetricSegment
                  value={`${netGrowth >= 0 ? '+' : ''}${netGrowth}`}
                  label={netGrowthLabel}
                  tone={netGrowthTone}
                />
              </MetricGroup>
              <DetailPanel state={details.left} />
              <DetailPanel state={details.added} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <MetricGroup>
                  <MetricSegment value={effectiveTrialToday?.planned ?? 0} label="планировали прийти сегодня" tone="muted" />
                  <MetricArrow />
                  <MetricSegment
                    value={effectiveTrialToday?.came ?? 0}
                    label="пришли сегодня"
                    percent={trialTodayPct}
                    detailsOpen={details.trialToday?.open}
                    onToggleDetails={() => toggleDetail('trialToday', loadTrialTodayDetails, 'navy')}
                  />
                </MetricGroup>
                <DetailPanel state={details.trialToday} />
              </div>

              <div className="flex flex-col gap-2">
                <MetricGroup>
                  <MetricSegment
                    value={effectiveTrialMonth?.total ?? 0}
                    label={`пробные за ${currentMonthName}`}
                    tone="muted"
                    detailsOpen={details.trialMonth?.open}
                    onToggleDetails={() => toggleDetail('trialMonth', loadTrialMonthDetails, 'muted')}
                  />
                  <MetricArrow />
                  <MetricSegment
                    value={`${effectiveTrialMonth?.retainedPct ?? 0}%`}
                    label="остались"
                    tone="success"
                    detailsOpen={details.trialRetained?.open}
                    onToggleDetails={() => toggleDetail('trialRetained', loadTrialRetainedDetails, 'success')}
                  />
                </MetricGroup>
                <DetailPanel state={details.trialMonth} />
                <DetailPanel state={details.trialRetained} />
              </div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {updatedAgo && (
              <p className="text-[12px] text-muted">
                {isStale ? `Цифры последнего обновления (${updatedAgo}) — сейчас, возможно, устарели` : `Обновлено ${updatedAgo}`}
              </p>
            )}
            <button
              type="button"
              onClick={manualRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-[12px] text-navy hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {refreshing ? 'Обновляю…' : 'Обновить сейчас'}
            </button>
          </div>
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
