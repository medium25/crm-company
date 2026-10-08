import { PageHeader } from '../components/layout/PageHeader.jsx';
import { StaffSettingsTab } from '../components/settings/StaffSettingsTab.jsx';

/**
 * Раздел «Сотрудники» (пункт бокового меню) — список сотрудников, добавление, роли, цвета и
 * деактивация. Доступен только CEO и менеджеру (см. маршрут /staff в App.jsx и Sidebar.ROLE_ITEM_KEYS);
 * само содержимое — тот же компонент, что вкладка «Сотрудники» в настройках.
 */
export function StaffPage() {
  return (
    <>
      <PageHeader title="Сотрудники" />
      <StaffSettingsTab />
    </>
  );
}
