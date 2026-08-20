import { useNavigate } from 'react-router-dom';
import { FileText, TrendingUp, ChevronRight } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Card } from '../components/ui/Card.jsx';

const SECTIONS = [
  { key: 'list', to: '/reports/list', icon: FileText, title: 'Отчёты', sub: 'Выручка, курсы, учителя, посещаемость, отток, долги.' },
  { key: 'stats', to: '/reports/stats', icon: TrendingUp, title: 'Статистика', sub: 'Оценка по отделам — сейчас отдел продаж, остальные скоро.' },
];

/** Лендинг «Отчёты и статистика» — 2 карточки, дальше своя вложенная навигация. */
export function ReportsLandingPage() {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader title="Отчёты и статистика" />
      <div className="flex flex-col gap-3">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key} hoverable className="flex cursor-pointer items-center gap-4 p-5" onClick={() => navigate(s.to)}>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-soft text-orange">
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <span className="flex-1">
                <span className="block text-[17px] font-bold text-text">{s.title}</span>
                <span className="block text-[13px] text-muted">{s.sub}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
            </Card>
          );
        })}
      </div>
    </>
  );
}
