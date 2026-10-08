import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, FieldPath, getDocs, query, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { db } from '../../firebase.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { useToast } from '../ui/Toast.jsx';
import { Button } from '../ui/Button.jsx';
import { pluralize } from '../../lib/format.js';
import {
  DEFAULT_PAY_PERIOD,
  currentPayPeriod,
  fixationDate,
  pastPayPeriods,
  paymentsInPeriod,
  salaryFor,
  termsConfigured,
} from '../../lib/teacherPay.js';

const fmtSum = (n) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} сум`;
const fmtMlnShort = (n) => (n / 1e6).toFixed(1).replace('.', ',').replace(',0', '');
const fmtMln = (n) => `${(n / 1e6).toFixed(1).replace('.', ',')} млн`;

/** Цвета плиток месяцев — от токенов графиков (chart-1…6), пастель как у карточек отделов. */
function tileStyle(i) {
  const hue = `rgb(var(--color-chart-${(i % 7) + 1}))`;
  const mix = (pct) => `color-mix(in srgb, ${hue} ${pct}%, rgb(var(--color-surface)))`;
  return { backgroundColor: mix(14), borderColor: mix(38), color: `color-mix(in srgb, ${hue} 60%, rgb(var(--color-text)))` };
}

/** Процент 0–100 со стрелками «−/+» (шаг 5) и ручным вводом. */
function PercentStepper({ value, onChange }) {
  const set = (v) => onChange(Math.max(0, Math.min(100, Math.round(Number(v) || 0))));
  return (
    <span className="inline-flex h-8 items-center overflow-hidden rounded-field border border-border-strong bg-surface font-bold">
      <button type="button" aria-label="Уменьшить процент" onClick={() => set(value - 5)} className="h-full px-2.5 text-navy hover:bg-chip">
        −
      </button>
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(e) => set(e.target.value)}
        aria-label="Процент"
        className="h-full w-12 bg-transparent text-center text-small text-text outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <span className="pr-1 text-small text-muted">%</span>
      <button type="button" aria-label="Увеличить процент" onClick={() => set(value + 5)} className="h-full px-2.5 text-navy hover:bg-chip">
        +
      </button>
    </span>
  );
}

/** «5 октября — 4 ноября» (без года) и короткая «5 окт — 4 ноя» для плиток. */
const fmtRange = (p) => `${format(p.start, 'd MMMM', { locale: ru })} — ${format(p.end, 'd MMMM', { locale: ru })}`;
const fmtRangeShort = (p) => `${format(p.start, 'd MMM', { locale: ru }).replace('.', '')} — ${format(p.end, 'd MMM', { locale: ru }).replace('.', '')}`;

/** Сетка чисел 1–31 для выбора одного числа месяца. */
function DayGrid({ label, value, onChange }) {
  return (
    <div>
      <p className="mb-1.5 text-caption font-bold text-text">{label}</p>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={value === d}
            className={`h-8 rounded-field text-caption font-bold ${value === d ? 'bg-navy text-white' : 'bg-chip text-text hover:bg-border'}`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Настройка периода выплаты: два числа месяца выбираются в сетках, рядом сразу видно, какие даты
 * получатся в этом месяце. Сохраняется кнопкой (случайный клик не меняет расчёт).
 */
function PeriodEditor({ pp, onSave, onClose }) {
  const [from, setFrom] = useState(pp.from);
  const [to, setTo] = useState(pp.to);
  const preview = currentPayPeriod(new Date(), { from, to });
  return (
    <div className="rounded-card border border-border-strong bg-card p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DayGrid label="Период начинается с числа" value={from} onChange={setFrom} />
        <DayGrid label="и заканчивается числом" value={to} onChange={setTo} />
      </div>
      <p className="mt-3 text-small text-text">
        В этом месяце: <b>{fmtRange(preview)}</b>
        {from > to && <span className="text-muted"> (период переходит на следующий месяц)</span>}
      </p>
      <p className="mt-0.5 text-caption text-muted">«31» — это последнее число месяца: в месяце из 30 дней период закончится 30-го, в феврале — 28-го (29-го).</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" size="sm" onClick={() => { setFrom(1); setTo(31); }}>
          Весь месяц (1 → 31)
        </Button>
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" onClick={() => onSave({ from, to })} disabled={from === pp.from && to === pp.to}>
            Сохранить период
          </Button>
        </span>
      </div>
    </div>
  );
}

/** Шаг оси «красивый»: 1, 2, 2.5, 5 × 10^k. */
function niceStep(max, ticks = 4) {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? mag * 10;
}

/**
 * График «Оборот и ученики по периодам»: линия с полыми точками (как на дашборде), число оборота над
 * точкой, плашка с числом РАЗНЫХ оплативших учеников под названием периода. Последняя точка — текущий период.
 * @param {{points: Array<{label: string, paid: number|null, students: number|null, current?: boolean}>}} props
 */
function TurnoverChart({ points }) {
  const W = 560;
  const H = 210;
  const pl = 44;
  const pr = 14;
  const pt = 22;
  const pb = 44;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const known = points.map((p) => p.paid ?? 0);
  const step = niceStep(Math.max(1, ...known));
  const top = step * 4;
  const x = (i) => pl + (iw * (i + 0.5)) / points.length;
  const y = (v) => pt + ih * (1 - v / top);
  const line = points
    .map((p, i) => (p.paid === null ? null : `${x(i).toFixed(1)},${y(p.paid).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Оборот и число учеников по периодам" style={{ minWidth: 520 }}>
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(step * t)} y2={y(step * t)} className="stroke-border" strokeWidth="1" />
            <text x={pl - 6} y={y(step * t) + 3} textAnchor="end" fontSize="9" className="fill-muted">
              {t === 0 ? '0' : `${fmtMlnShort(step * t)} млн`}
            </text>
          </g>
        ))}
        <polyline fill="none" className="stroke-text" strokeWidth="2" strokeLinejoin="round" points={line} />
        {points.map((p, i) => (
          <g key={p.label + i}>
            {p.paid !== null && (
              <>
                <circle cx={x(i)} cy={y(p.paid)} r="5" strokeWidth="2" className={`stroke-text ${p.current ? 'fill-text' : 'fill-surface'}`} />
                <text x={x(i)} y={y(p.paid) - 10} textAnchor="middle" fontSize="9.5" fontWeight="700" className="fill-text">
                  {fmtMlnShort(p.paid)}
                </text>
              </>
            )}
            <text x={x(i)} y={H - pb + 14} textAnchor="middle" fontSize="10" fontWeight={p.current ? 700 : 400} className={p.current ? 'fill-text' : 'fill-muted'}>
              {p.label}
            </text>
            <rect x={x(i) - 24} y={H - pb + 20} width="48" height="17" rx="8.5" className={p.current ? 'fill-success/15' : 'fill-chip'} />
            <text x={x(i)} y={H - pb + 32} textAnchor="middle" fontSize="10" fontWeight="700" className={p.current ? 'fill-success' : 'fill-muted'}>
              {p.students === null ? '—' : `${p.students} уч.`}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/**
 * «Финансы» учителя: период выплаты (два числа месяца), оплаты учеников за период, зарплата текущего периода
 * в реальном времени, плитки шести прошлых периодов и «Условия работы» (процент по группам / фикс).
 * Зарплата прошлых периодов фиксируется в teachers.payroll, когда их впервые открывают после окончания
 * (по условиям, действующим на этот момент), и дальше не пересчитывается.
 * @param {Object} props
 * @param {Object} props.teacher документ teachers (id, payPeriod, payTerms, payroll)
 */
export function TeacherFinance({ teacher }) {
  const { user } = useAuth();
  const { activeBranchId } = useBranch();
  const { showToast } = useToast();
  const pp = teacher.payPeriod ?? DEFAULT_PAY_PERIOD;
  const terms = teacher.payTerms ?? null;
  const payroll = teacher.payroll ?? {};

  const cur = useMemo(() => currentPayPeriod(new Date(), pp), [pp.from, pp.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const past = useMemo(() => pastPayPeriods(new Date(), pp), [pp.from, pp.to]); // eslint-disable-line react-hooks/exhaustive-deps

  // Группы учителя (для процентов) и оплаты текущего периода — живая подписка.
  const groupsQuery = useMemo(
    () => (db && activeBranchId ? query(collection(db, 'groups'), where('branchId', '==', activeBranchId), where('teacherId', '==', teacher.id), where('isArchived', '==', false)) : null),
    [activeBranchId, teacher.id],
  );
  const { data: groups } = useCollection(groupsQuery);
  const paymentsQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(
            collection(db, 'transactions'),
            where('branchId', '==', activeBranchId),
            where('type', '==', 'payment'),
            where('date', '>=', Timestamp.fromDate(cur.start)),
            where('date', '<=', Timestamp.fromDate(cur.end)),
          )
        : null,
    [activeBranchId, cur.start, cur.end],
  );
  const { data: branchPayments } = useCollection(paymentsQuery);
  const curPays = useMemo(() => paymentsInPeriod(branchPayments, teacher.id, cur), [branchPayments, teacher.id, cur]);
  const curPaid = curPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const live = salaryFor(curPays, terms);

  // Фиксация прошлых периодов: считаем только когда условия заданы, чтобы не заморозить нули.
  const fixing = useRef(false);
  useEffect(() => {
    if (!db || !activeBranchId || fixing.current || !termsConfigured(terms)) return;
    const missing = past.filter((p) => !payroll[p.key]);
    if (missing.length === 0) return;
    fixing.current = true;
    (async () => {
      try {
        const from = missing.reduce((a, p) => (p.start < a ? p.start : a), missing[0].start);
        const to = missing.reduce((a, p) => (p.end > a ? p.end : a), missing[0].end);
        const snap = await getDocs(
          query(collection(db, 'transactions'), where('branchId', '==', activeBranchId), where('type', '==', 'payment'), where('date', '>=', Timestamp.fromDate(from)), where('date', '<=', Timestamp.fromDate(to))),
        );
        const all = snap.docs.map((d) => d.data());
        const args = [];
        for (const p of missing) {
          const pays = paymentsInPeriod(all, teacher.id, p);
          const { total } = salaryFor(pays, terms);
          args.push(new FieldPath('payroll', p.key), { amount: total, paid: pays.reduce((s, x) => s + (Number(x.amount) || 0), 0), mode: terms.mode, from: pp.from, to: pp.to });
        }
        await updateDoc(doc(db, 'teachers', teacher.id), ...args, 'updatedAt', serverTimestamp(), 'updatedBy', user.uid);
      } catch {
        // не получилось сейчас — попробуем при следующем открытии
        fixing.current = false;
      }
    })();
  }, [past, payroll, terms, activeBranchId, teacher.id, pp.from, pp.to, user.uid]);

  // Оборот и число учеников по периодам (не зависят от условий работы) — считаем один раз по оплатам и
  // записываем в teachers.periodStats; дальше график и «прошлый оборот» читают записанное, оплаты не перечитываются.
  const stats = teacher.periodStats ?? {};
  const statsWriting = useRef(false);
  useEffect(() => {
    if (!db || !activeBranchId || statsWriting.current) return;
    const missing = past.filter((p) => !stats[p.key]);
    if (missing.length === 0) return;
    statsWriting.current = true;
    (async () => {
      try {
        const from = missing.reduce((m, p) => (p.start < m ? p.start : m), missing[0].start);
        const to = missing.reduce((m, p) => (p.end > m ? p.end : m), missing[0].end);
        const snap = await getDocs(
          query(collection(db, 'transactions'), where('branchId', '==', activeBranchId), where('type', '==', 'payment'), where('date', '>=', Timestamp.fromDate(from)), where('date', '<=', Timestamp.fromDate(to))),
        );
        const all = snap.docs.map((d) => d.data());
        const args = [];
        for (const p of missing) {
          const pays = paymentsInPeriod(all, teacher.id, p);
          args.push(new FieldPath('periodStats', p.key), {
            paid: pays.reduce((sum, x) => sum + (Number(x.amount) || 0), 0),
            students: new Set(pays.map((x) => x.studentId)).size,
            payments: pays.length,
          });
        }
        await updateDoc(doc(db, 'teachers', teacher.id), ...args, 'updatedAt', serverTimestamp(), 'updatedBy', user.uid);
      } catch {
        statsWriting.current = false;
      }
    })();
  }, [past, stats, activeBranchId, teacher.id, user.uid]);

  const lastKey = past[0].key;
  const stored = payroll[lastKey];
  const lastPaid = stats[lastKey] ? Number(stats[lastKey].paid) || 0 : stored ? Number(stored.paid) || 0 : null;
  const lastSalary = stored ? stored.amount : null;
  const chartPoints = [
    ...[...past].reverse().map((p) => ({ label: format(p.start, 'LLL', { locale: ru }).replace('.', ''), paid: stats[p.key]?.paid ?? payroll[p.key]?.paid ?? null, students: stats[p.key]?.students ?? null })),
    { label: format(cur.start, 'LLL', { locale: ru }).replace('.', ''), paid: curPaid, students: new Set(curPays.map((x) => x.studentId)).size, current: true },
  ];

  const [editingPeriod, setEditingPeriod] = useState(false);
  const savePeriod = async (next) => {
    try {
      await updateDoc(doc(db, 'teachers', teacher.id), { payPeriod: next, updatedAt: serverTimestamp(), updatedBy: user.uid });
      setEditingPeriod(false);
      showToast('Период выплаты сохранён.');
    } catch {
      showToast('Не удалось сохранить период.', { type: 'error' });
    }
  };

  // Условия работы — локальная правка, сохраняется кнопкой.
  const [mode, setMode] = useState(terms?.mode ?? 'percent');
  const [percents, setPercents] = useState(terms?.groupPercents ?? {});
  const [fixed, setFixed] = useState(String(terms?.fixedAmount ?? ''));
  const [bulk, setBulk] = useState(30);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setMode(teacher.payTerms?.mode ?? 'percent');
    setPercents(teacher.payTerms?.groupPercents ?? {});
    setFixed(String(teacher.payTerms?.fixedAmount ?? ''));
  }, [teacher.payTerms]);
  const pctOf = (id) => Number(percents[id]) || 0;
  const draft = { mode, groupPercents: percents, fixedAmount: Number(String(fixed).replace(/\s/g, '')) || 0 };
  const dirty = JSON.stringify({ m: draft.mode, p: draft.groupPercents, f: draft.fixedAmount }) !== JSON.stringify({ m: terms?.mode ?? 'percent', p: terms?.groupPercents ?? {}, f: Number(terms?.fixedAmount) || 0 });
  const draftSalary = salaryFor(curPays, draft);

  const saveTerms = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'teachers', teacher.id), { payTerms: draft, updatedAt: serverTimestamp(), updatedBy: user.uid });
      showToast('Условия работы сохранены.');
    } catch {
      showToast('Не удалось сохранить условия.', { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const orderedGroups = useMemo(() => [...groups].sort((a, b) => String(a.code).localeCompare(String(b.code), 'ru', { numeric: true })), [groups]);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-card border border-border-strong bg-card p-5">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <p className="flex items-center gap-1.5 text-caption text-muted">
              <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" />
              Оборот за {format(cur.start, 'LLLL', { locale: ru })} · {fmtRangeShort(cur)}
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-page font-bold tracking-tight text-text md:text-kpi">{fmtSum(curPaid)}</p>
              <span className="mb-1.5 rounded-badge bg-success/15 px-2.5 py-0.5 text-caption text-success">
                зарплата <b className="font-bold">{termsConfigured(terms) ? fmtSum(live.total) : '—'}</b>
              </span>
            </div>
            <p className="text-caption text-muted">
              {curPays.length} {pluralize(curPays.length, ['оплата', 'оплаты', 'оплат'])}
              {termsConfigured(terms) ? ` · зарплата зафиксируется ${format(fixationDate(cur), 'd MMMM', { locale: ru })}` : ' · задайте условия работы ниже'}
            </p>
          </div>
          <div>
            <p className="text-caption text-muted">
              Оборот за {format(past[0].start, 'LLLL', { locale: ru })} · {fmtRangeShort(past[0])}
            </p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <p className="text-page font-bold tracking-tight text-muted md:text-kpi">{lastPaid === null ? '—' : fmtSum(lastPaid)}</p>
              <span className="mb-1.5 rounded-badge bg-chip px-2.5 py-0.5 text-caption text-muted">
                зарплата <b className="font-bold text-text">{lastSalary === null ? '—' : fmtSum(lastSalary)}</b>
              </span>
            </div>
            <p className="text-caption text-muted">{stored ? 'зарплата зафиксирована' : termsConfigured(terms) ? 'зарплата считается…' : 'задайте условия работы ниже'}</p>
          </div>
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-2 text-small font-bold text-text">
            Оборот и ученики по периодам <span className="font-normal text-muted">· ученики — сколько разных людей оплатили в периоде</span>
          </p>
          <TurnoverChart points={chartPoints} />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-2 border-t border-border pt-3 text-small text-muted">
          Период выплаты: <b className="text-text">{fmtRange(cur)}</b>
          <button type="button" onClick={() => setEditingPeriod((v) => !v)} className="font-bold text-link hover:underline">
            {editingPeriod ? 'Скрыть настройку' : 'Изменить'}
          </button>
        </div>
      </div>

      {editingPeriod && <PeriodEditor pp={pp} onSave={savePeriod} onClose={() => setEditingPeriod(false)} />}

      <div>
        <p className="mb-2 text-body font-bold text-text">Прошлые месяцы</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[...past].reverse().map((p, i, arr) => {
            const item = payroll[p.key];
            const prev = i > 0 ? payroll[arr[i - 1].key] : null;
            const delta = item && prev && prev.amount > 0 ? Math.round(((item.amount - prev.amount) / prev.amount) * 100) : null;
            return (
              <div key={p.key} className="rounded-row border-[1.5px] px-3 py-2.5" style={tileStyle(i)}>
                <p className="text-caption font-bold uppercase">{format(p.start, 'LLL', { locale: ru }).replace('.', '')}</p>
                <p className="mt-0.5 text-title font-bold">{item ? fmtMln(item.amount) : '—'}</p>
                <p className="text-caption opacity-80">{fmtRangeShort(p)}</p>
                {delta !== null && (
                  <p className="text-caption opacity-80">
                    {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}% к прошлому
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-card border border-border-strong bg-card p-4">
        <p className="mb-3 text-body font-bold text-text">Условия работы</p>
        <div className="mb-4 inline-flex rounded-badge bg-chip p-1">
          {[
            ['percent', 'Процент от оборота'],
            ['fixed', 'Фиксированная оплата'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`rounded-badge px-4 py-1.5 text-small font-bold ${mode === key ? 'bg-surface text-text shadow-card' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'percent' ? (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-row border-[1.5px] border-navy/30 bg-navy/10 px-3 py-2">
              <span className="text-small text-text">Для всех групп сразу:</span>
              <PercentStepper value={bulk} onChange={setBulk} />
              <Button size="sm" onClick={() => setPercents(Object.fromEntries(orderedGroups.map((g) => [g.id, bulk])))}>
                Применить
              </Button>
            </div>
            {orderedGroups.length === 0 ? (
              <p className="py-3 text-small text-muted">У учителя нет активных групп.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-small">
                  <thead>
                    <tr className="text-left text-caption text-muted">
                      <th className="px-2 py-1 font-semibold">Группа</th>
                      <th className="px-2 py-1 text-right font-semibold">Оплатили за период</th>
                      <th className="px-2 py-1 font-semibold">Процент</th>
                      <th className="px-2 py-1 text-right font-semibold">Зарплата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderedGroups.map((g) => {
                      const paid = draftSalary.byGroup[g.id]?.paid ?? 0;
                      return (
                        <tr key={g.id} className="border-t border-border">
                          <td className="px-2 py-2">
                            <span className="rounded-badge bg-chip px-2.5 py-0.5 font-bold text-text">{g.code}</span>
                          </td>
                          <td className="px-2 py-2 text-right text-text">{fmtSum(paid)}</td>
                          <td className="px-2 py-2">
                            <PercentStepper value={pctOf(g.id)} onChange={(v) => setPercents((p) => ({ ...p, [g.id]: v }))} />
                          </td>
                          <td className="px-2 py-2 text-right font-bold text-text">{fmtSum((paid * pctOf(g.id)) / 100)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t-[1.5px] border-border-strong px-2 pt-3 font-bold text-text">
              <span>Итого за период</span>
              <span>{fmtSum(draftSalary.total)}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-caption text-muted" htmlFor="fixed-pay">
              Оплата за период
            </label>
            <input
              id="fixed-pay"
              inputMode="numeric"
              value={fixed}
              onChange={(e) => setFixed(e.target.value.replace(/[^\d\s]/g, ''))}
              placeholder="0"
              className="h-11 w-60 rounded-field border border-border-strong bg-surface px-3 text-title font-bold text-text outline-none focus:border-navy"
            />
            <p className="text-caption text-muted">Столько получает учитель за каждый период, независимо от оплат учеников.</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-3">
          {dirty && <span className="text-caption text-muted">Есть несохранённые изменения</span>}
          <Button onClick={saveTerms} loading={saving} disabled={!dirty}>
            Сохранить условия
          </Button>
        </div>
      </div>
    </div>
  );
}
