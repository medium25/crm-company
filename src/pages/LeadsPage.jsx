import { useState } from 'react';
import { Inbox, ListChecks } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';

const TABS = [
  { key: 'queue', label: 'Записи' },
  { key: 'results', label: 'Результаты' },
];

/**
 * Заглушка на 2 вкладки — раздел временно пустой, наполнение отложено.
 * Рабочая версия со списком лидов/пробных и действиями (звонок, отказ,
 * перевод в пробный) уже реализована в git-истории этого файла — вернуть
 * при готовности, разложив по вкладкам «Записи»/«Результаты».
 */
export function LeadsPage() {
  const [tab, setTab] = useState('queue');

  return (
    <>
      <PageHeader title="Заявки" />
      <div className="mb-6">
        <Tabs tabs={TABS} activeKey={tab} onChange={setTab} />
      </div>
      <EmptyState icon={tab === 'queue' ? Inbox : ListChecks} title="Раздел появится позже" />
    </>
  );
}
