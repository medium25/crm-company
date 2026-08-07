import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { db } from '../../firebase.js';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useBranch } from '../../hooks/useBranch.js';
import { BillingBanner } from '../billing/BillingBanner.jsx';
import { countActiveLeads } from '../../lib/stats.js';

/**
 * Оболочка приложения для всех авторизованных маршрутов: сайдбар + топбар + контент.
 * Максимальная ширина контента 1600px по центру, отступ 24px (16px на мобильном).
 * < md сайдбар скрыт — открывается выдвижным меню по гамбургеру в Topbar
 * (учитель заходит с телефона отмечать посещаемость, постоянная колонка съедала половину экрана).
 */
export function AppShell() {
  const { branches, activeBranchId, setActiveBranchId } = useBranch();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [leadsCount, setLeadsCount] = useState(0);

  useEffect(() => {
    if (!db || !activeBranchId) return;
    countActiveLeads(db, activeBranchId).then(setLeadsCount);
  }, [activeBranchId]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar leadsCount={leadsCount} mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          branches={branches}
          activeBranchId={activeBranchId}
          onBranchChange={setActiveBranchId}
          billingBanner={<BillingBanner />}
          onMenuClick={() => setMobileNavOpen(true)}
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
