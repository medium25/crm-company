import { useMemo } from 'react';
import { collection, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useBranch } from '../../hooks/useBranch.js';
import { useCollection } from '../../hooks/useCollection.js';
import { Skeleton } from '../ui/Skeleton.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { GraduationCap } from 'lucide-react';

// Буква для кружка без фото: первая буква имени, без обращения «MR / MS / MRS» («MS KRISTINA» → K).
const initial = (name) => (name ?? '').trim().replace(/^(mrs|mr|ms|miss)\.?\s+/i, '').charAt(0).toUpperCase() || '?';

/** Эффективность учителя 0–100 (поле teachers.efficiency, задаётся вручную); нет значения — null. */
function efficiencyOf(teacher) {
  const n = Number(teacher.efficiency);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

// Цвет карточки по эффективности: зелёный — хорошо, жёлтый — средне, красный — плохо.
const TIERS = {
  good: 'rgb(var(--color-success))',
  mid: 'rgb(214 158 30)',
  bad: 'rgb(var(--color-danger))',
};

/**
 * Уровень эффективности: есть число (teachers.efficiency, 0–100) — по порогам 70 / 40; пока числа нет —
 * временное случайное, но устойчивое распределение по id учителя (не меняется между открытиями).
 */
function tierOf(teacher, eff) {
  if (eff !== null) return eff >= 70 ? 'good' : eff >= 40 ? 'mid' : 'bad';
  let h = 2166136261;
  for (const ch of String(teacher.id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ['good', 'mid', 'bad'][(h >>> 0) % 3];
}

function TeacherCard({ teacher, onOpen }) {
  const eff = efficiencyOf(teacher);
  const hue = TIERS[tierOf(teacher, eff)];
  const mix = (pct) => `color-mix(in srgb, ${hue} ${pct}%, rgb(var(--color-surface)))`;
  return (
    <button
      type="button"
      onClick={() => onOpen(teacher)}
      className="flex min-h-[10rem] flex-col rounded-card border-[1.5px] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
      style={{ backgroundColor: mix(14), borderColor: mix(38) }}
    >
      {teacher.photoUrl ? (
        <img src={teacher.photoUrl} alt="" className="mb-3 h-14 w-14 rounded-full object-cover" />
      ) : (
        <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full text-title font-bold text-white" style={{ backgroundColor: hue }}>
          {initial(teacher.displayName)}
        </span>
      )}
      <span className="text-title font-bold" style={{ color: `color-mix(in srgb, ${hue} 60%, rgb(var(--color-text)))` }}>
        {teacher.displayName}
      </span>
      <span className="mt-auto pt-3">
        <span className="mb-1 flex items-center justify-between text-caption text-muted">
          <span>Эффективность</span>
          <b className="text-text">{eff === null ? '—' : `${eff}%`}</b>
        </span>
        <span className="block h-2 rounded-badge" style={{ backgroundColor: mix(22) }} aria-hidden="true">
          <span className="block h-full rounded-badge" style={{ width: `${eff ?? 0}%`, backgroundColor: hue }} />
        </span>
      </span>
    </button>
  );
}

/**
 * Карточки учителей учебного отдела: фото, имя и оценка эффективности. Содержимое внутри карточки
 * (страница учителя) пока пустое.
 * @param {Object} props
 * @param {(teacher: Object) => void} props.onOpen
 */
export function TeacherCards({ onOpen }) {
  const { activeBranchId } = useBranch();
  const teachersQuery = useMemo(
    () =>
      db && activeBranchId
        ? query(collection(db, 'teachers'), where('branchIds', 'array-contains', activeBranchId), where('isArchived', '==', false), orderBy('displayName'))
        : null,
    [activeBranchId],
  );
  const { data: teachers, loading, error } = useCollection(teachersQuery);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }
  if (error) return <p className="text-control text-danger">Не удалось загрузить учителей.</p>;
  if (teachers.length === 0) return <EmptyState icon={GraduationCap} title="Учителей пока нет" />;

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
      {teachers.map((t) => (
        <TeacherCard key={t.id} teacher={t} onOpen={onOpen} />
      ))}
    </div>
  );
}
