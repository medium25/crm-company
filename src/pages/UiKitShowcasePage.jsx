import { PageHeader } from '../components/layout/PageHeader.jsx';
import { ButtonsAndBadgesShowcase } from '../components/dev/ButtonsAndBadgesShowcase.jsx';
import { FormControlsShowcase } from '../components/dev/FormControlsShowcase.jsx';
import { DataDisplayShowcase } from '../components/dev/DataDisplayShowcase.jsx';
import { OverlaysShowcase } from '../components/dev/OverlaysShowcase.jsx';
import { FeedbackShowcase } from '../components/dev/FeedbackShowcase.jsx';

const SECTIONS = [
  ['Кнопки и бейджи', ButtonsAndBadgesShowcase],
  ['Поля форм', FormControlsShowcase],
  ['Данные (StatCard, Card, Tabs, Table)', DataDisplayShowcase],
  ['Модалки и toast', OverlaysShowcase],
  ['Пусто и загрузка', FeedbackShowcase],
];

/**
 * Витрина UI-kit для визуальной сверки с docs/reference/ по критериям приёмки Фазы 0.
 */
export function UiKitShowcasePage() {
  return (
    <>
      <PageHeader title="UI-kit" />
      <div className="flex flex-col gap-10">
        {SECTIONS.map(([title, Section]) => (
          <section key={title}>
            <h2 className="mb-4 text-[20px] font-bold text-text">{title}</h2>
            <Section />
          </section>
        ))}
      </div>
    </>
  );
}
