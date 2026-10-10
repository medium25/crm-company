import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight, BarChart3, Building2, GraduationCap, Star, Users, Wallet } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useDoc } from '../hooks/useDoc.js';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { TeacherCards } from '../components/staff/TeacherCards.jsx';
import { TeacherFinance } from '../components/staff/TeacherFinance.jsx';
import { StaffEvaluationList } from '../components/staff/StaffEvaluationList.jsx';
import { BackButton } from '../components/ui/BackButton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';

/**
 * Отделы компании. tone — токен цвета (danger/success/navy), от него считается пастельная
 * карточка, как у карточек-разделов. Внутри отделов пока ничего нет.
 */
const DEPARTMENTS = [
  { key: 'academic', title: 'Учебный отдел', icon: GraduationCap, tone: 'danger' },
  { key: 'administration', title: 'Администрация', icon: Building2, tone: 'success' },
  { key: 'hr', title: 'HR отдел', icon: Users, tone: 'navy' },
];

/** Общие разделы над отделами — графитовая лента из двух половин; страницы пока заготовки. */
const OVERVIEW = [
  { key: 'stats', title: 'Общая статистика', note: 'Выручка, ученики, конверсия', icon: BarChart3 },
  { key: 'rating', title: 'Оценка сотрудников', note: 'Рейтинг и эффективность', icon: Star },
];

const toneColor = (tone) => `rgb(var(--color-${tone}))`;
const mix = (tone, pct) => `color-mix(in srgb, ${toneColor(tone)} ${pct}%, rgb(var(--color-surface)))`;

/**
 * Раздел «Сотрудники» (пункт бокового меню; только CEO и менеджер) — три отдела крупными карточками.
 * /staff — список отделов, /staff/:key — страница отдела (в «Учебном отделе» — карточки учителей),
 * /staff/:key/:teacherId — страница учителя (плитки разделов), /…/finance — «Финансы» учителя (TeacherFinance).
 * Управление самими сотрудниками (роли, цвета, доступ) — в «Настройки → Назначение сотрудников».
 */
export function StaffPage() {
  const navigate = useNavigate();
  const { dept, teacherId, section } = useParams();
  const current = DEPARTMENTS.find((d) => d.key === dept);
  const overview = OVERVIEW.find((o) => o.key === dept);
  // Карточка под курсором/фокусом: подъём на 2 px и тень цвета отдела.
  const [active, setActive] = useState(null);
  const teacherRef = useMemo(() => (db && teacherId ? doc(db, 'teachers', teacherId) : null), [teacherId]);
  const { data: teacher } = useDoc(teacherRef);

  if (overview) {
    return (
      <>
        <BackButton to="/staff" className="mb-4">
          Все отделы
        </BackButton>
        {overview.key === 'rating' ? (
          <StaffEvaluationList />
        ) : (
          <EmptyState icon={overview.icon} title={overview.title} subtitle="Раздел в разработке." />
        )}
      </>
    );
  }

  if (dept && !current) return <PageHeader title="Отдел не найден" actions={<Link to="/staff" className="text-control text-link">К отделам</Link>} />;

  // «Финансы» учителя: период, оплаты, зарплата, прошлые месяцы и условия работы.
  if (current && teacherId && section === 'finance') {
    return (
      <>
        <BackButton to={`/staff/${current.key}/${teacherId}`} className="mb-4">
          {teacher?.displayName ?? 'Учитель'}
        </BackButton>
        <PageHeader title="Финансы" />
        {teacher && <TeacherFinance teacher={teacher} />}
      </>
    );
  }

  // Страница учителя — плитки разделов; пока один раздел — «Финансы».
  if (current && teacherId) {
    const stored = Object.entries(teacher?.payroll ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, v]) => Number(v.amount) || 0);
    const max = Math.max(1, ...stored);
    return (
      <>
        <BackButton to={`/staff/${current.key}`} className="mb-4">
          {current.title}
        </BackButton>
        <PageHeader title={teacher?.displayName ?? ''} />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          <button
            type="button"
            onClick={() => navigate(`/staff/${current.key}/${teacherId}/finance`)}
            className="flex min-h-[8.5rem] flex-col rounded-card border-[1.5px] p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
            style={{ backgroundColor: mix('success', 12), borderColor: mix('success', 32) }}
          >
            <span className="flex items-center gap-2 text-title font-bold" style={{ color: toneColor('success') }}>
              <Wallet className="h-5 w-5" aria-hidden="true" /> Финансы
            </span>
            <span className="text-caption text-muted">Зарплата и условия работы</span>
            <span className="mt-auto flex h-7 items-end gap-1" aria-hidden="true">
              {stored.map((v, i) => (
                <i key={i} className="block flex-1 rounded-t-badge" style={{ height: `${Math.max(12, Math.round((v / max) * 100))}%`, backgroundColor: toneColor('success') }} />
              ))}
            </span>
          </button>
        </div>
      </>
    );
  }

  if (current) {
    return (
      <>
        <BackButton to="/staff" className="mb-4">
          Все отделы
        </BackButton>
        {current.key === 'academic' && <TeacherCards onOpen={(t) => navigate(`/staff/academic/${t.id}`)} />}
      </>
    );
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-1 overflow-hidden rounded-card bg-orange text-surface sm:grid-cols-2">
        {OVERVIEW.map((o, i) => {
          const Icon = o.icon;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => navigate(`/staff/${o.key}`)}
              className={`flex items-center gap-4 px-6 py-5 text-left transition hover:bg-surface/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-surface/60 ${i ? 'border-t border-surface/25 sm:border-l sm:border-t-0' : ''}`}
            >
              <Icon className="h-7 w-7 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-title font-bold">{o.title}</span>
                <span className="block text-small opacity-75">{o.note}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 opacity-75" aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {DEPARTMENTS.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => navigate(`/staff/${d.key}`)}
              onMouseEnter={() => setActive(d.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(d.key)}
              onBlur={() => setActive(null)}
              className="flex min-h-[15rem] flex-col rounded-card border-[1.5px] p-6 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40"
              style={{
                backgroundColor: mix(d.tone, 12),
                borderColor: mix(d.tone, 32),
                transform: active === d.key ? 'translateY(-2px)' : undefined,
                boxShadow: active === d.key ? `0 10px 28px color-mix(in srgb, ${toneColor(d.tone)} 30%, transparent)` : undefined,
              }}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-card text-white" style={{ backgroundColor: toneColor(d.tone) }}>
                <Icon className="h-7 w-7" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="mt-auto flex items-end justify-between gap-3">
                <span className="min-w-0 break-words text-page font-bold" style={{ color: toneColor(d.tone) }}>
                  {d.title}
                </span>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-surface" style={{ borderColor: mix(d.tone, 32), color: toneColor(d.tone) }}>
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
