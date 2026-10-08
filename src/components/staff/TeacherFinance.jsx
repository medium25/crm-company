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

function DayInput({ value, onCommit, label }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n >= 1 && n <= 31) {
      if (n !== value) onCommit(n);
    } else {
      setText(String(value));
    }
  };
  return (
    <input
      type="number"
      min={1}
      max={31}
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="h-9 w-14 rounded-field border border-border-strong bg-surface text-center text-control font-bold text-text outline-none focus:border-navy [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
    />
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

  const savePeriod = async (patch) => {
    try {
      await updateDoc(doc(db, 'teachers', teacher.id), { payPeriod: { ...pp, ...patch }, updatedAt: serverTimestamp(), updatedBy: user.uid });
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
      <div className="grid grid-cols-1 overflow-hidden rounded-card border border-border-strong bg-card md:grid-cols-3">
        <div className="p-4">
          <p className="text-caption text-muted">Период выплаты</p>
          <div className="my-2 flex items-center gap-2">
            <DayInput value={pp.from} onCommit={(n) => savePeriod({ from: n })} label="Период с числа" />
            <span className="text-muted" aria-hidden="true">→</span>
            <DayInput value={pp.to} onCommit={(n) => savePeriod({ to: n })} label="Период по число" />
          </div>
          <p className="text-caption text-muted">
            с {pp.from}-го по {pp.to}-е число
          </p>
        </div>
        <div className="border-t border-border-strong p-4 md:border-l md:border-t-0">
          <p className="text-caption text-muted">Оплатили ученики за период</p>
          <p className="mt-1 text-page font-bold text-text">{fmtSum(curPaid)}</p>
          <p className="text-caption text-muted">
            {curPays.length} {pluralize(curPays.length, ['оплата', 'оплаты', 'оплат'])}
          </p>
        </div>
        <div className="border-t border-border-strong bg-navy/10 p-4 md:border-l md:border-t-0">
          <p className="flex flex-wrap items-center gap-2 text-caption text-muted">
            Зарплата за {format(cur.start, 'LLLL', { locale: ru })}
            <span className="inline-flex items-center gap-1.5 rounded-badge bg-success/15 px-2 py-0.5 text-caption font-bold text-success">
              <i className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" /> сейчас
            </span>
          </p>
          <p className="mt-1 text-page font-bold text-navy">{termsConfigured(terms) ? fmtSum(live.total) : '—'}</p>
          <p className="text-caption text-muted">
            {termsConfigured(terms) ? `зафиксируется ${format(fixationDate(cur), 'd MMMM', { locale: ru })}` : 'задайте условия работы ниже'}
          </p>
        </div>
      </div>

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
