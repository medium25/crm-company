import { useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader.jsx';
import { Tabs } from '../components/ui/Tabs.jsx';
import { BranchSettingsTab } from '../components/settings/BranchSettingsTab.jsx';
import { StaffSettingsTab } from '../components/settings/StaffSettingsTab.jsx';
import { DirectoriesTab } from '../components/settings/DirectoriesTab.jsx';
import { SmsTemplatesTab } from '../components/settings/SmsTemplatesTab.jsx';
import { BillingHistoryTab } from '../components/settings/BillingHistoryTab.jsx';

const TABS = [
  { key: 'branch', label: 'Филиал' },
  { key: 'staff', label: 'Сотрудники' },
  { key: 'directories', label: 'Справочники' },
  { key: 'sms', label: 'Шаблоны SMS' },
  { key: 'billing', label: 'Биллинг' },
];

export function SettingsPage() {
  const [tab, setTab] = useState('branch');

  return (
    <>
      <PageHeader title="Настройки" />
      <Tabs tabs={TABS} activeKey={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'branch' && <BranchSettingsTab />}
        {tab === 'staff' && <StaffSettingsTab />}
        {tab === 'directories' && <DirectoriesTab />}
        {tab === 'sms' && <SmsTemplatesTab />}
        {tab === 'billing' && <BillingHistoryTab />}
      </div>
    </>
  );
}
