import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Briefcase, Megaphone, ClipboardList, GraduationCap, Clock } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';

const DEPARTMENTS = [
  { key: 'sales', to: '/reports/stats/sales', icon: Briefcase, title: 'Отдел продаж', sub: 'Воронка и оценка операторов.', enabled: true },
  { key: 'marketing', icon: Megaphone, title: 'Отдел маркетинга', sub: 'Источники, стоимость лида, ROI.', enabled: false },
  { key: 'admin', icon: ClipboardList, title: 'Администрация', sub: 'Дисциплина, задачи, загрузка.', enabled: false },
  { key: 'education', icon: GraduationCap, title: 'Учебный отдел', sub: 'Посещаемость, качество занятий.', enabled: false },
];

/** «Статистика» — выбор отдела. Пока реален только «Отдел продаж», остальные — заглушки. */
export function StatsDepartmentsPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        title="Статистика"
        actions={
          <button type="button" onClick={() => navigate('/reports')} className="flex items-center gap-1 text-[14px] font-bold text-navy hover:text-navy-hover">
            <ChevronLeft className="h-4 w-4" /> Отчёты и статистика
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DEPARTMENTS.map((d) => {
          const Icon = d.icon;
          return (
            <Card
              key={d.key}
              hoverable={d.enabled}
              className={`relative flex items-center gap-4 p-5 ${d.enabled ? 'cursor-pointer' : 'opacity-60'}`}
              onClick={d.enabled ? () => navigate(d.to) : undefined}
            >
              {!d.enabled && (
                <span className="absolute right-4 top-4 flex items-center gap-1 rounded-badge bg-surface-alt px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                  <Clock className="h-3 w-3" /> В будущем
                </span>
              )}
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${d.enabled ? 'bg-orange-soft text-orange' : 'bg-surface-alt text-muted'}`}>
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <span className="flex-1">
                <span className="block text-[17px] font-bold text-text">{d.title}</span>
                <span className="block text-[13px] text-muted">{d.sub}</span>
              </span>
              {d.enabled && <ChevronRight className="h-5 w-5 shrink-0 text-muted" />}
            </Card>
          );
        })}
      </div>
    </>
  );
}
