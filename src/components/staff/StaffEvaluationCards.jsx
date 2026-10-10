import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { formatDateTimeShort, formatName, pluralize } from '../../lib/format.js';
import { Button } from '../ui/Button.jsx';

const RATER_LABEL = { client: 'Клиент', colleague: 'Коллега' };

// Статичные классы — Tailwind JIT не собирает `bg-${tone}` на лету. Зоны те же, что в анкете: 0–3 / 4–6 / 7–9; 10 — графитовая.
const ZONE = {
  danger: { badge: 'bg-danger/10 text-danger', bar: 'bg-danger' },
  warning: { badge: 'bg-warning/10 text-warning', bar: 'bg-warning' },
  success: { badge: 'bg-success/10 text-success', bar: 'bg-success' },
  graphite: { badge: 'bg-orange/10 text-orange', bar: 'bg-orange' },
};
const zoneOf = (v) => (v < 4 ? 'danger' : v < 7 ? 'warning' : v >= 10 ? 'graphite' : 'success');
const fmt = (v) => v.toFixed(1).replace('.', ',');

const AVATAR_BG = ['bg-navy', 'bg-success', 'bg-warning', 'bg-danger'];
const toneOf = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_BG[h % AVATAR_BG.length];
};

const average = (nums) => nums.reduce((s, n) => s + n, 0) / nums.length;
/** Средний балл одной оценки (по всем её вопросам). */
export const evaluationAverage = (ev) => average(Object.values(ev.ratings ?? {}).map(Number));

/** Сводка по сотруднику: общий балл — среднее из средних баллов его оценок; людей — сколько разных оценивающих. */
function summarize(evals) {
  if (evals.length === 0) return null;
  return { overall: average(evals.map(evaluationAverage)), people: new Set(evals.map((e) => e.createdBy)).size };
}

const peopleLabel = (n) => `${n} ${pluralize(n, ['человек', 'человека', 'человек'])}`;

function ScoreBadge({ value }) {
  return <span className={`rounded-row px-2.5 py-0.5 text-control font-bold tabular-nums ${ZONE[zoneOf(value)].badge}`}>{fmt(value)}</span>;
}

function PeoplePill({ n }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-badge bg-navy/10 px-2.5 py-0.5 text-caption font-bold text-navy">
      <Users className="h-3.5 w-3.5" aria-hidden="true" />
      оценили: {peopleLabel(n)}
    </span>
  );
}

function MemberCard({ member, summary, selected, onSelect }) {
  const initial = (member.fullName ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col rounded-card border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${
        selected ? 'border-navy' : 'border-border-strong'
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-control font-bold text-white ${toneOf(member.id)}`}>{initial}</span>
        <span className="min-w-0">
          <span className="block truncate text-control font-bold text-text">{formatName(member.fullName)}</span>
          <span className="block truncate text-caption text-muted">{member.roleForEval || '—'}</span>
        </span>
      </span>
      <span className="mb-1.5 mt-3 flex items-baseline gap-1.5">
        <span className="text-kpi font-bold text-text">{summary ? fmt(summary.overall) : '—'}</span>
        <span className="text-caption text-muted">из 10</span>
      </span>
      <span className="mb-3 block h-1.5 rounded-badge bg-chip" aria-hidden="true">
        {summary && <span className={`block h-full rounded-badge ${ZONE[zoneOf(summary.overall)].bar}`} style={{ width: `${summary.overall * 10}%` }} />}
      </span>
      {summary ? <PeoplePill n={summary.people} /> : <span className="text-caption text-muted">Пока никто не оценил</span>}
    </button>
  );
}

function EvaluationRow({ ev, evaluator }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(ev.ratings ?? {}).sort(([a], [b]) => Number(a) - Number(b));
  return (
    <div className="border-t border-border py-3">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-navy" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-control text-text">
            {evaluator ? formatName(evaluator) : 'Неизвестно'} <span className="text-caption text-muted">· {RATER_LABEL[ev.raterRole] ?? ev.raterRole}</span>
          </p>
          <p className="text-caption text-muted">{ev.createdAt ? formatDateTimeShort(ev.createdAt) : 'сохраняется…'}</p>
          {ev.comment && <p className="mt-1 text-small text-text">«{ev.comment}»</p>}
          {open && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entries.map(([i, v]) => (
                <span key={i} className={`rounded-row px-2 py-0.5 text-caption font-bold ${ZONE[zoneOf(Number(v))].badge}`}>
                  {Number(i) + 1}: {v}
                </span>
              ))}
            </div>
          )}
        </div>
        <ScoreBadge value={evaluationAverage(ev)} />
        <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
          {open ? 'Скрыть' : 'Баллы'}
        </Button>
      </div>
    </div>
  );
}

/**
 * «Оценка сотрудников»: карточки сотрудников с общим баллом (среднее из средних баллов всех оценок) и числом
 * оценивших; по клику внизу — лента оценок: кто, когда и какой средний балл поставил, «Баллы» показывают
 * ответы на все вопросы.
 * @param {Object} props
 * @param {Object[]} props.members сотрудники (id, fullName, roleForEval)
 * @param {Object[]} props.evaluations документы staffEvaluations
 * @param {Map<string, string>} props.nameByUid uid оценившего → имя
 * @param {(member: Object) => void} props.onEvaluate открыть анкету
 */
export function StaffEvaluationCards({ members, evaluations, nameByUid, onEvaluate }) {
  const [selectedId, setSelectedId] = useState(null);
  const byStaff = useMemo(() => {
    const map = new Map();
    for (const ev of evaluations) {
      if (!map.has(ev.staffId)) map.set(ev.staffId, []);
      map.get(ev.staffId).push(ev);
    }
    return map;
  }, [evaluations]);

  const selected = members.find((m) => m.id === selectedId) ?? null;
  const selectedEvals = selected ? (byStaff.get(selected.id) ?? []) : [];
  const selectedSummary = summarize(selectedEvals);

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {members.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            summary={summarize(byStaff.get(m.id) ?? [])}
            selected={m.id === selectedId}
            onSelect={() => setSelectedId((cur) => (cur === m.id ? null : m.id))}
          />
        ))}
      </div>

      {selected && (
        <section className="mt-4 rounded-card border border-border-strong bg-card p-5">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="flex-1 text-title font-bold text-text">{formatName(selected.fullName)} — кто и когда оценивал</h3>
            {selectedSummary && (
              <>
                <PeoplePill n={selectedSummary.people} />
                <span className="text-caption text-muted">общий</span>
                <ScoreBadge value={selectedSummary.overall} />
              </>
            )}
            <Button size="sm" onClick={() => onEvaluate(selected)}>
              <Plus className="h-4 w-4" /> Оценить
            </Button>
          </div>
          {selectedEvals.length === 0 ? (
            <p className="py-6 text-center text-control text-muted">Оценок пока нет.</p>
          ) : (
            selectedEvals.map((ev) => <EvaluationRow key={ev.id} ev={ev} evaluator={nameByUid.get(ev.createdBy)} />)
          )}
        </section>
      )}
    </>
  );
}
