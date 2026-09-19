import { useState } from 'react';
import { Tabs } from '../components/ui/Tabs.jsx';
import { BranchSettingsTab } from '../components/settings/BranchSettingsTab.jsx';
import { StaffSettingsTab } from '../components/settings/StaffSettingsTab.jsx';
import { LeadAssignmentTab } from '../components/settings/LeadAssignmentTab.jsx';
import { DirectoriesTab } from '../components/settings/DirectoriesTab.jsx';
import { SmsTemplatesTab } from '../components/settings/SmsTemplatesTab.jsx';
import { BillingHistoryTab } from '../components/settings/BillingHistoryTab.jsx';
import { OperatorScoringCriteriaTab } from '../components/settings/OperatorScoringCriteriaTab.jsx';
import { FirebaseUsageTab } from '../components/settings/FirebaseUsageTab.jsx';
import { useAuth } from '../hooks/useAuth.js';

const TABS = [
  { key: 'branch', label: 'Филиал' },
  { key: 'staff', label: 'Сотрудники' },
  { key: 'leadAssignment', label: 'Распределение лидов' },
  { key: 'operatorScoring', label: 'Оценка операторов' },
  { key: 'directories', label: 'Справочники' },
  { key: 'sms', label: 'Шаблоны SMS' },
  { key: 'billing', label: 'Биллинг' },
];
// Расход Firebase видят только CEO и менеджер (правила доступа к usage — то же).
const USAGE_TAB = { key: 'firebase', label: 'Расход Firebase' };

export function SettingsPage() {
  const { staff } = useAuth();
  const [tab, setTab] = useState('branch');
  const tabs = staff?.role === 'ceo' || staff?.role === 'manager' ? [...TABS, USAGE_TAB] : TABS;

  return (
    <>
      <Tabs tabs={tabs} activeKey={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'branch' && <BranchSettingsTab />}
        {tab === 'staff' && <StaffSettingsTab />}
        {tab === 'leadAssignment' && <LeadAssignmentTab />}
        {tab === 'operatorScoring' && <OperatorScoringCriteriaTab />}
        {tab === 'directories' && <DirectoriesTab />}
        {tab === 'sms' && <SmsTemplatesTab />}
        {tab === 'billing' && <BillingHistoryTab />}
        {tab === 'firebase' && <FirebaseUsageTab />}
      </div>
    </>
  );
}
