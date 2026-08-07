import { Inbox } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';

/**
 * Заглушка — раздел временно пустой, наполнение отложено (просьба
 * оставить так, пока не готовы к запуску). Рабочая версия со списком
 * лидов/пробных и действиями (звонок, отказ, перевод в пробный) уже
 * реализована в git-истории этого файла — вернуть при готовности.
 */
export function LeadsPage() {
  return (
    <>
      <PageHeader title="Заявки" />
      <EmptyState icon={Inbox} title="Раздел появится позже" />
    </>
  );
}
