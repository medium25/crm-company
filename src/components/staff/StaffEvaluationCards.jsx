import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Star, Trash2 } from 'lucide-react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useToast } from '../ui/Toast.jsx';
import { Modal } from '../ui/Modal.jsx';
import { Button } from '../ui/Button.jsx';
import { BackButton } from '../ui/BackButton.jsx';
import { formatDateTimeShort, formatName, pluralize } from '../../lib/format.js';
import { operatorInitials } from '../leads/LeadCard.jsx';
import { PICK_OFF, PICK_ON, QUESTIONS, SCALE_VALUES } from './StaffEvaluationModal.jsx';

const RATER_LABEL = { client: 'Клиент', colleague: 'Коллега' };

const average = (nums) => nums.reduce((s, n) => s + n, 0) / nums.length;
const fmt = (v) => v.toFixed(1).replace('.', ',');
/** Средний балл одной оценки (по всем её вопросам). */
export const evaluationAverage = (ev) => average(Object.values(ev.ratings ?? {}).map(Number));

/** Сводка по сотруднику: общий балл — среднее из средних баллов его оценок; людей — сколько разных оценивающих. */
function summarize(evals) {
  if (evals.length === 0) return null;
  return { overall: average(evals.map(evaluationAverage)), people: new Set(evals.map((e) => e.createdBy)).size };
}

const peopleLabel = (n) => `${n} ${pluralize(n, ['человек', 'человека', 'человек'])}`;

// Жёлтый бейдж общего балла, как в опросах Яндекса: от 8 насыщенный, 5–7,9 бледнее, ниже 5 красноватый.
const scoreClass = (v) => (v >= 8 ? 'bg-trial text-black' : v >= 5 ? 'bg-trial/40 text-black' : 'bg-danger/15 text-danger');

function ScoreBadge({ value, className = '' }) {
  return (
    <span className={`inline-flex min-w-[3.25rem] items-center justify-center rounded-row px-3 py-2 text-title font-bold tabular-nums ${value == null ? 'bg-chip text-muted' : scoreClass(value)} ${className}`}>
      {value == null ? '—' : fmt(value)}
    </span>
  );
}

const DEFAULT_COLOR = '#8B94A3'; // design-ok: тот же серый по умолчанию, что у бейджа оператора в «Заявках» (цвет сотрудника — данные)

/** Квадратный бейдж с инициалами, как у операторов в «Заявках»: полупрозрачный фон и текст цвета сотрудника (staff.color). */
/** Пять звёзд, как у Яндекса: балл 0–10 → закраска до value/2 звёзд (дробная часть — частично закрашенная звезда). */
function Stars({ value, size = 'h-4 w-4' }) {
  const row = (cls) => [0, 1, 2, 3, 4].map((i) => <Star key={i} className={`${size} shrink-0 ${cls}`} strokeWidth={1.5} aria-hidden="true" />);
  return (
    <span className="relative inline-flex" role="img" aria-label={`${fmt(value)} из 10`}>
      <span className="inline-flex gap-0.5">{row('fill-chip text-chip')}</span>
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${Math.max(0, Math.min(100, value * 10))}%` }}>
        <span className="inline-flex w-max gap-0.5">{row('fill-trial text-trial')}</span>
      </span>
    </span>
  );
}

function Avatar({ member, size = 'h-11 w-11 text-control' }) {
  const color = member.color || DEFAULT_COLOR;
  return (
    <span className={`flex ${size} shrink-0 items-center justify-center rounded-row font-bold`} style={{ backgroundColor: `${color}26`, color }}>
      {operatorInitials(member.fullName) || '?'}
    </span>
  );
}

function MemberRow({ member, summary, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy/30"
    >
      <Avatar member={member} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-control font-bold text-text">{formatName(member.fullName)}</span>
        <span className="block truncate text-small text-muted">
          {member.roleForEval || '—'} · {summary ? `оценили: ${peopleLabel(summary.people)}` : 'пока никто не оценил'}
        </span>
      </span>
      <ScoreBadge value={summary?.overall ?? null} />
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
    </button>
  );
}

/** Ответы целиком: каждый вопрос полностью и вся шкала 0–10 с отмеченным выбором оценившего (только просмотр). */
function AnswersView({ ev }) {
  const questions = QUESTIONS[ev.raterRole] ?? [];
  const ratings = ev.ratings ?? {};
  return (
    <div className="mt-3 flex flex-col gap-4">
      {Object.keys(ratings)
        .sort((a, b) => Number(a) - Number(b))
        .map((i) => {
          const value = Number(ratings[i]);
          return (
            <div key={i}>
              <p className="mb-1.5 text-control text-text">
                {Number(i) + 1}. {questions[Number(i)] ?? `Вопрос ${Number(i) + 1}`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SCALE_VALUES.map((n) => (
                  <span
                    key={n}
                    aria-current={n === value ? 'true' : undefined}
                    className={`flex h-8 w-8 items-center justify-center rounded-row text-small font-bold ${n === value ? PICK_ON : 'bg-chip text-muted'}`}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function EvaluationRow({ ev, evaluator, onDelete }) {
  // Демо-оценки макета не удаляются (их нет в базе).
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-border py-3">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-trial" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-control text-text">
            {evaluator ? formatName(evaluator) : 'Неизвестно'} <span className="text-caption text-muted">· {RATER_LABEL[ev.raterRole] ?? ev.raterRole}</span>
          </p>
          <p className="text-caption text-muted">{ev.createdAt ? formatDateTimeShort(ev.createdAt) : 'сохраняется…'}</p>
          <span className="mt-1 block">
            <Stars value={evaluationAverage(ev)} />
          </span>
          {ev.comment && <p className="mt-1 text-small text-text">«{ev.comment}»</p>}
        </div>
        <span className="min-w-[2.75rem] text-right text-title font-bold tabular-nums text-text">{fmt(evaluationAverage(ev))}</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-0.5 rounded-field px-1 py-1 text-small font-bold text-text hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
        >
          {open ? 'Скрыть' : 'Баллы'}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {ev.demo ? (
          <span className="h-8 w-8 shrink-0" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => onDelete(ev)}
            aria-label="Удалить оценку"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-field text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {open && (
        <div className="ml-5">
          <AnswersView ev={ev} />
        </div>
      )}
    </div>
  );
}

const FILTERS = [
  { key: 'all', label: 'Все', match: () => true },
  { key: 'teacher', label: 'Учителя', match: (m) => m.roleForEval === 'Учитель' },
  { key: 'admin', label: 'Администраторы', match: (m) => m.roleForEval === 'Администратор' },
  { key: 'other', label: 'Другие', match: (m) => m.roleForEval !== 'Учитель' && m.roleForEval !== 'Администратор' },
];

/**
 * «Оценка сотрудников»: список сотрудников с жёлтым бейджем общего балла (среднее из средних баллов всех оценок)
 * и числом оценивших. Клик открывает сотрудника — кто, когда и какой средний балл поставил; «Баллы» раскрывают все
 * вопросы целиком и выбор оценившего на шкале; корзина удаляет оценку.
 * @param {Object} props
 * @param {Object[]} props.members сотрудники (id, fullName, roleForEval)
 * @param {Object[]} props.evaluations документы staffEvaluations
 * @param {Map<string, string>} props.nameByUid uid оценившего → имя
 * @param {(member: Object) => void} props.onEvaluate открыть анкету
 * @param {(drilled: boolean) => void} [props.onDrillChange] открыт ли сотрудник (страница прячет свою «назад»)
 */
export function StaffEvaluationCards({ members, evaluations, nameByUid, onEvaluate, onDrillChange }) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    onDrillChange?.(selectedId !== null);
    return () => onDrillChange?.(false);
  }, [selectedId, onDrillChange]);

  const byStaff = useMemo(() => {
    const map = new Map();
    for (const ev of evaluations) {
      if (!map.has(ev.staffId)) map.set(ev.staffId, []);
      map.get(ev.staffId).push(ev);
    }
    return map;
  }, [evaluations]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'staffEvaluations', deleteTarget.id));
      showToast('Оценка удалена.');
      setDeleteTarget(null);
    } catch {
      showToast('Не удалось удалить оценку.', { type: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  const selected = members.find((m) => m.id === selectedId) ?? null;
  const deleteDialog = (
    <Modal
      open={Boolean(deleteTarget)}
      onClose={() => setDeleteTarget(null)}
      title="Удалить оценку?"
      footer={
        <>
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Отмена
          </Button>
          <Button variant="danger" onClick={confirmDelete} loading={deleting}>
            Удалить
          </Button>
        </>
      }
    >
      <p className="text-control text-text">
        Оценка {deleteTarget ? `${fmt(evaluationAverage(deleteTarget))} от ${nameByUid.get(deleteTarget.createdBy) ? formatName(nameByUid.get(deleteTarget.createdBy)) : 'неизвестного'}` : ''} будет удалена
        безвозвратно, общий балл пересчитается.
      </p>
    </Modal>
  );

  if (selected) {
    const evals = byStaff.get(selected.id) ?? [];
    const summary = summarize(evals);
    return (
      <>
        <BackButton onClick={() => setSelectedId(null)} className="mb-4">
          Все сотрудники
        </BackButton>
        <section className="rounded-card border border-border-strong bg-card p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Avatar member={selected} size="h-12 w-12 text-title" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-title font-bold text-text">{formatName(selected.fullName)}</h3>
              <p className="text-small text-muted">
                {selected.roleForEval || '—'} · {summary ? `оценили: ${peopleLabel(summary.people)}` : 'пока никто не оценил'}
              </p>
              {summary && (
                <span className="mt-1 block">
                  <Stars value={summary.overall} size="h-5 w-5" />
                </span>
              )}
            </div>
            <span className="text-kpi font-bold text-text">
              {summary ? fmt(summary.overall) : '—'}
              <span className="ml-1 text-control font-bold text-muted">/ 10</span>
            </span>
            <button
              type="button"
              onClick={() => onEvaluate(selected)}
              className="inline-flex h-11 items-center gap-1.5 rounded-card bg-trial px-5 text-control font-bold text-black transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" /> Оценить
            </button>
          </div>
          {evals.length === 0 ? (
            <p className="py-6 text-center text-control text-muted">Оценок пока нет.</p>
          ) : (
            evals.map((ev) => <EvaluationRow key={ev.id} ev={ev} evaluator={ev.demoEvaluator ?? nameByUid.get(ev.createdBy)} onDelete={setDeleteTarget} />)
          )}
        </section>
        {deleteDialog}
      </>
    );
  }

  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  // От большего общего балла к меньшему; без оценок — в конце (по имени, как пришли).
  const visible = members
    .filter(active.match)
    .map((m) => ({ m, summary: summarize(byStaff.get(m.id) ?? []) }))
    .sort((a, b) => (b.summary?.overall ?? -1) - (a.summary?.overall ?? -1));
  const filters = FILTERS.filter((f) => f.key === 'all' || members.some(f.match));
  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={f.key === filter}
            className={`rounded-badge px-4 py-2 text-control font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 ${f.key === filter ? PICK_ON : PICK_OFF}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-card border border-border">
        {visible.map(({ m, summary }) => (
          <MemberRow key={m.id} member={m} summary={summary} onSelect={() => setSelectedId(m.id)} />
        ))}
      </div>
      {deleteDialog}
    </>
  );
}
