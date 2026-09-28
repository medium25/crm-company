import { useEffect, useMemo, useState } from 'react';
import { collection, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { Card } from '../ui/Card.jsx';
import { formatMoney, formatSource, pluralize } from '../../lib/format.js';

// Источник лида по студенту — читается из карточки студента; кэш на всё время сессии страницы,
// чтобы смена периода/фильтра не перечитывала уже известных (чтение Firestore — 1 на студента).
const sourceCache = new Map(); // studentId → source | 'none'
const CHUNK = 30; // предел `in` в Firestore

const BAR_COLORS = ['#378ADD', '#1D9E75', '#BA7517', '#7F77DD', '#888780', '#D4537E', '#0F6E56'];

/**
 * «Анализ источников оплат» — сколько оплат пришло с каждого источника лида (Таргет, Инстаграм …):
 * название (число оплат), полоса, доля и сумма. Считаются платежи (type=payment) из переданного
 * списка — того же, что показан в таблице ниже (с учётом фильтров страницы); каждый платёж — одна
 * оплата. Оплаты студентов без источника — в «Не указан».
 * @param {Object} props
 * @param {Array<Object>} props.payments транзакции type=payment за период
 */
export function PaymentSourceAnalysis({ payments }) {
  const [, force] = useState(0);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const studentIds = useMemo(() => [...new Set(payments.map((t) => t.studentId).filter(Boolean))], [payments]);
  const missingKey = studentIds.filter((id) => !sourceCache.has(id)).join(',');

  useEffect(() => {
    if (!db || !missingKey) return undefined;
    const missing = missingKey.split(',');
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const chunks = [];
    for (let i = 0; i < missing.length; i += CHUNK) chunks.push(missing.slice(i, i + CHUNK));
    Promise.all(chunks.map((ids) => getDocs(query(collection(db, 'students'), where(documentId(), 'in', ids)))))
      .then((snaps) => {
        for (const snap of snaps) for (const d of snap.docs) sourceCache.set(d.id, d.data().source || 'none');
        for (const id of missing) if (!sourceCache.has(id)) sourceCache.set(id, 'none'); // студент удалён
        if (!cancelled) force((n) => n + 1);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const rows = useMemo(() => {
    const map = new Map();
    for (const t of payments) {
      if (!sourceCache.has(t.studentId) && t.studentId) continue; // источник ещё грузится
      const key = sourceCache.get(t.studentId) ?? 'none';
      const cur = map.get(key) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += t.amount ?? 0;
      map.set(key, cur);
    }
    const total = [...map.values()].reduce((s, r) => s + r.count, 0);
    const maxCount = Math.max(1, ...[...map.values()].map((r) => r.count));
    return {
      total,
      list: [...map.entries()]
        .map(([key, r]) => ({
          key,
          label: key === 'none' ? 'Не указан' : (formatSource(key) ?? key),
          ...r,
          pct: total ? Math.round((r.count / total) * 100) : 0,
          width: Math.round((r.count / maxCount) * 100),
        }))
        .sort((a, b) => b.count - a.count),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, missingKey, loading]);

  return (
    <Card className="mb-6">
      <p className="mb-3 text-[15px] font-bold text-text">
        Анализ источников оплат{' '}
        <span className="text-[12px] font-normal text-muted">
          · {rows.total} {pluralize(rows.total, ['оплата', 'оплаты', 'оплат'])}
        </span>
      </p>
      {failed ? (
        <p className="text-[13px] text-danger">Не удалось определить источники оплат.</p>
      ) : rows.list.length === 0 ? (
        <p className="text-[13px] text-muted">{loading ? 'Считаю…' : 'За выбранный период оплат нет.'}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.list.map((r, i) => (
            <div key={r.key} className="flex items-center gap-3 text-[13px]">
              <span className="w-36 shrink-0 text-text">
                {r.label} <span className="text-muted">({r.count})</span>
              </span>
              <span className="h-4 flex-1 overflow-hidden rounded bg-surface-alt">
                <span className="block h-full rounded" style={{ width: `${r.width}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
              </span>
              <span className="w-10 shrink-0 text-right text-muted">{r.pct}%</span>
              <span className="w-28 shrink-0 text-right font-bold text-text">{formatMoney(r.amount)}</span>
            </div>
          ))}
          {loading && <p className="text-[12px] text-muted">Догружаю источники…</p>}
        </div>
      )}
    </Card>
  );
}
