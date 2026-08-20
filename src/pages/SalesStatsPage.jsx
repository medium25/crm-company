import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, query, where } from 'firebase/firestore';
import { format, startOfMonth } from 'date-fns';
import { ChevronLeft, Settings2, TrendingUp } from 'lucide-react';
import { db } from '../firebase.js';
import { useBranch } from '../hooks/useBranch.js';
import { useCollection } from '../hooks/useCollection.js';
import { useDoc } from '../hooks/useDoc.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';
import { DatePicker } from '../components/ui/DatePicker.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { funnelByOperator, currentOverdueHoursByOperator } from '../lib/reports.js';
import { operatorInitials } from '../components/leads/LeadCard.jsx';
import { DEFAULT_OPERATOR_SCORE_CRITERIA, gradeRate, gradeOverdue, overallGrade, formatOverdueHours } from '../lib/operatorScoring.js';

const GRADE_BADGE = {
  good: 'bg-success/10 text-success',
  warn: 'bg-orange-soft text-orange',
  bad: 'bg-danger/10 text-danger',
};
const CONV_BADGE = {
  good: 'bg-success/10 text-success',
  warn: 'bg-orange-soft text-orange',
  bad: 'bg-danger/10 text-danger',
};
// Один и тот же светофор везде — полосы воронки, конверсия между шагами,
// бейдж просрочки — красим по фактическому grade (good/warn/bad), не
// отдельным hardcoded «плохо = красное, иначе синее».
const GRADE_HEX = { good: '#34A853', warn: '#E5842B', bad: '#C0392B' };
const AVATAR_PALETTE = ['#E5842B', '#22406B', '#3E8B84', '#2F80D8', '#8B5CF6', '#C0392B'];

function avatarColor(operatorId) {
  let hash = 0;
  for (let i = 0; i < operatorId.length; i++) hash = (hash * 31 + operatorId.charCodeAt(i)) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[hash];
}

/** grade=null — нейтральный шаг без оценки (сама «Лиды», база 100%). */
function FunnelStep({ label, count, total, grade }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const color = grade ? GRADE_HEX[grade] : '#8B94A3';
  return (
    <div className="grid h-[26px] grid-cols-[78px_1fr_38px] items-center gap-2.5">
      <span className="text-[11.5px] font-bold text-text">{label}</span>
      <div className="relative h-4 overflow-hidden rounded-[4px] bg-surface-alt">
        <div className="absolute inset-y-0 left-0 rounded-[4px] transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-right text-[12px] font-extrabold tabular-nums">{count}</span>
    </div>
  );
}

function ConvBadge({ fromLabel, fromCount, toCount, grade }) {
  const pct = fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0;
  return (
    <div className="grid h-[30px] grid-cols-[78px_1fr_38px] items-center">
      <span />
      <span className="flex items-center gap-2.5">
        <span className={`inline-flex w-[64px] items-center justify-center gap-1 rounded-[6px] py-1 text-[15px] font-extrabold tabular-nums ${CONV_BADGE[grade]}`}>
          {pct}%
        </span>
        <span className="text-[10.5px] text-muted">
          от «{fromLabel}» — {toCount} из {fromCount}
        </span>
      </span>
    </div>
  );
}

/** «Отдел продаж» — воронка + оценка операторов, реальные данные (funnelByOperator + currentOverdueHoursByOperator). */
export function SalesStatsPage() {
  const navigate = useNavigate();
  const { activeBranchId } = useBranch();

  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(today, 'yyyy-MM-dd'));
  const fromDate = useMemo(() => new Date(`${from}T00:00:00`), [from]);
  const toDate = useMemo(() => new Date(`${to}T23:59:59`), [to]);

  const staffQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'staff'), where('branchIds', 'array-contains', activeBranchId)) : null),
    [activeBranchId],
  );
  const { data: staffList } = useCollection(staffQuery);
  const operatorByUid = useMemo(() => {
    const map = new Map();
    for (const s of staffList) map.set(s.id, s);
    return map;
  }, [staffList]);

  const settingsRef = useMemo(() => (db && activeBranchId ? doc(db, 'settings', activeBranchId) : null), [activeBranchId]);
  const { data: branchSettings } = useDoc(settingsRef);
  const criteria = branchSettings?.operatorScoreCriteria ?? DEFAULT_OPERATOR_SCORE_CRITERIA;

  const [loading, setLoading] = useState(false);
  const [funnelRows, setFunnelRows] = useState([]);
  const [overdueByOperator, setOverdueByOperator] = useState(new Map());

  useEffect(() => {
    if (!db || !activeBranchId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([funnelByOperator(db, activeBranchId, fromDate, toDate), currentOverdueHoursByOperator(db, activeBranchId)]).then(([rows, overdue]) => {
      if (cancelled) return;
      setFunnelRows(rows.filter((r) => r.operatorId !== 'unassigned').sort((a, b) => b.total - a.total));
      setOverdueByOperator(overdue);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeBranchId, fromDate, toDate]);

  return (
    <>
      <PageHeader
        title="Отдел продаж"
        actions={
          <button type="button" onClick={() => navigate('/reports/stats')} className="flex items-center gap-1 text-[14px] font-bold text-navy hover:text-navy-hover">
            <ChevronLeft className="h-4 w-4" /> Статистика
          </button>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <DatePicker label="От" value={from} onChange={(e) => setFrom(e.target.value)} />
        <DatePicker label="До" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="mb-5 flex items-center gap-2 rounded-field bg-surface-alt px-3.5 py-2.5 text-[13px] text-muted">
        <Settings2 className="h-4 w-4 shrink-0" />
        Пороги оценки (зелёный/жёлтый/красный) заданы в{' '}
        <button type="button" onClick={() => navigate('/settings')} className="font-bold text-navy underline hover:text-navy-hover">
          Настройках → Оценка операторов
        </button>
        .
      </div>

      {loading && <Skeleton className="h-64 w-full" />}

      {!loading && funnelRows.length === 0 && <EmptyState icon={TrendingUp} title="Нет лидов за период" />}

      {!loading && funnelRows.length > 0 && (
        <div className="flex flex-col gap-3">
          {funnelRows.map((r) => {
            const operator = operatorByUid.get(r.operatorId);
            const name = operator?.fullName ?? 'Без оператора';
            const color = avatarColor(r.operatorId);
            const overdueHours = overdueByOperator.get(r.operatorId) ?? 0;

            const dozvonConvPct = r.total > 0 ? (r.dozvon / r.total) * 100 : 0;
            const probnyConvPct = r.dozvon > 0 ? (r.trialScheduled / r.dozvon) * 100 : 0;
            const provodenConvPct = r.trialScheduled > 0 ? (r.attended / r.trialScheduled) * 100 : 0;
            const oplataConvPct = r.attended > 0 ? (r.won / r.attended) * 100 : 0;

            const dozvonGrade = gradeRate(dozvonConvPct, criteria.dozvon);
            const probnyGrade = gradeRate(probnyConvPct, criteria.probny);
            const provodenGrade = gradeRate(provodenConvPct, criteria.provoden);
            const oplataGrade = gradeRate(oplataConvPct, criteria.oplata);
            const overdueGrade = gradeOverdue(overdueHours, criteria.overdueHours);
            const grade = overallGrade({ dozvonGrade, probnyGrade, provodenGrade, oplataGrade, overdueGrade });

            return (
              <Card key={r.operatorId} className="p-4 sm:p-[18px]">
                <div className="mb-3.5 flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold"
                    style={{ backgroundColor: `${color}26`, color }}
                  >
                    {operatorInitials(name)}
                  </span>
                  <b className="text-[13px]">{name}</b>
                  <span className={`rounded-badge px-2.5 py-1 text-[10.5px] font-extrabold ${GRADE_BADGE[grade.tone]}`}>{grade.label}</span>
                  <span className="ml-auto text-[11px] text-muted">{r.total} {r.total === 1 ? 'лид' : 'лидов'}</span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <FunnelStep label="Лиды" count={r.total} total={r.total} grade={null} />
                  <ConvBadge fromLabel="Лиды" fromCount={r.total} toCount={r.dozvon} grade={dozvonGrade} />
                  <FunnelStep label="Дозвон" count={r.dozvon} total={r.total} grade={dozvonGrade} />
                  <ConvBadge fromLabel="Дозвон" fromCount={r.dozvon} toCount={r.trialScheduled} grade={probnyGrade} />
                  <FunnelStep label="Пробный" count={r.trialScheduled} total={r.total} grade={probnyGrade} />
                  <ConvBadge fromLabel="Пробный" fromCount={r.trialScheduled} toCount={r.attended} grade={provodenGrade} />
                  <FunnelStep label="Проведён" count={r.attended} total={r.total} grade={provodenGrade} />
                  <ConvBadge fromLabel="Проведён" fromCount={r.attended} toCount={r.won} grade={oplataGrade} />
                  <FunnelStep label="Оплата" count={r.won} total={r.total} grade={oplataGrade} />
                </div>

                <div className="mt-3.5 border-t border-border pt-3">
                  <div
                    className="w-fit rounded-field bg-surface-alt px-2.5 py-2"
                    style={{ borderLeft: `3px solid ${GRADE_HEX[overdueGrade]}` }}
                  >
                    <div className="text-[9.5px] font-bold uppercase tracking-wide text-muted">Средняя просрочка сейчас</div>
                    <div className="mt-0.5 text-[14px] font-extrabold">{overdueHours > 0 ? formatOverdueHours(overdueHours) : 'нет просрочек'}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
