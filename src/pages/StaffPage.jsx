import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, GraduationCap, Users } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';

/**
 * Отделы компании. tone — токен цвета (danger/success/navy), от него считается пастельная
 * карточка, как у карточек-разделов. Внутри отделов пока ничего нет.
 */
const DEPARTMENTS = [
  { key: 'academic', title: 'Учебный отдел', icon: GraduationCap, tone: 'danger' },
  { key: 'administration', title: 'Администрация', icon: Building2, tone: 'success' },
  { key: 'hr', title: 'HR отдел', icon: Users, tone: 'navy' },
];

const toneColor = (tone) => `rgb(var(--color-${tone}))`;
const mix = (tone, pct) => `color-mix(in srgb, ${toneColor(tone)} ${pct}%, rgb(var(--color-surface)))`;

/**
 * Раздел «Сотрудники» (пункт бокового меню; только CEO и менеджер) — три отдела крупными карточками.
 * /staff — список отделов, /staff/:key — страница отдела (пока пустая).
 * Управление самими сотрудниками (роли, цвета, доступ) — в «Настройки → Назначение сотрудников».
 */
export function StaffPage() {
  const navigate = useNavigate();
  const { dept } = useParams();
  const current = DEPARTMENTS.find((d) => d.key === dept);
  // Карточка под курсором/фокусом: подъём на 2 px и тень цвета отдела.
  const [active, setActive] = useState(null);

  if (dept && !current) return <PageHeader title="Отдел не найден" actions={<Link to="/staff" className="text-control text-link">К отделам</Link>} />;

  if (current) {
    return (
      <>
        <Link to="/staff" className="mb-4 flex items-center gap-1 text-control text-link">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Все отделы
        </Link>
        <PageHeader title={current.title} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Сотрудники" />
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
