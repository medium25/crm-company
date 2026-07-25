import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useBranch } from '../../hooks/useBranch.js';
import { BillingBanner } from '../billing/BillingBanner.jsx';

/**
 * Оболочка приложения для всех авторизованных маршрутов: сайдбар + топбар + контент.
 * Максимальная ширина контента 1600px по центру, отступ 24px (16px на мобильном).
 */
export function AppShell() {
  const { branches, activeBranchId, setActiveBranchId } = useBranch();

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          branches={branches}
          activeBranchId={activeBranchId}
          onBranchChange={setActiveBranchId}
          billingBanner={<BillingBanner />}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
