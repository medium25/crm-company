import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';
import { useBranch } from '../../hooks/useBranch.js';
import { BillingBanner } from '../billing/BillingBanner.jsx';

/**
 * Оболочка приложения для всех авторизованных маршрутов: шапка на всю ширину (поиск слева,
 * логотип по центру, профиль справа), под ней сайдбар + контент.
 * Максимальная ширина контента 1600px по центру, отступ 24px (16px на мобильном).
 * < md сайдбар скрыт — открывается выдвижным меню по гамбургеру в Topbar
 * (учитель заходит с телефона отмечать посещаемость, постоянная колонка съедала половину экрана).
 */
export function AppShell() {
  const { branches, activeBranchId, setActiveBranchId } = useBranch();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <Topbar branches={branches} activeBranchId={activeBranchId} onBranchChange={setActiveBranchId} onMenuClick={() => setMobileNavOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-content">
            {/* Баннер месячного начисления — над содержимым (в шапке по центру теперь логотип). */}
            <div className="mb-4 flex empty:hidden">
              <BillingBanner />
            </div>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
