import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.js';
import { useRole } from './hooks/useRole.js';
import { BranchProvider } from './hooks/useBranch.js';
import { ToastProvider } from './components/ui/Toast.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { DashboardPage } from './pages/DashboardPage.jsx';
import { LeadsPage } from './pages/LeadsPage.jsx';
import { TrialsPage } from './pages/TrialsPage.jsx';
import { StudentsPage } from './pages/StudentsPage.jsx';
import { StudentDetailPage } from './pages/StudentDetailPage.jsx';
import { GroupsPage } from './pages/GroupsPage.jsx';
import { GroupDetailPage } from './pages/GroupDetailPage.jsx';
import { TeachersPage } from './pages/TeachersPage.jsx';
import { TeacherDetailPage } from './pages/TeacherDetailPage.jsx';
import { TeachersAndGroupsPage } from './pages/TeachersAndGroupsPage.jsx';
import { CoursesPage } from './pages/CoursesPage.jsx';
import { RoomsPage } from './pages/RoomsPage.jsx';
import { PaymentsPage } from './pages/PaymentsPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { ReportsLandingPage } from './pages/ReportsLandingPage.jsx';
import { StatsDepartmentsPage } from './pages/StatsDepartmentsPage.jsx';
import { SalesStatsPage } from './pages/SalesStatsPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { UiKitShowcasePage } from './pages/UiKitShowcasePage.jsx';

// section → путь первого экрана этого раздела — для редиректа теста на
// разрешённый экран (Sidebar.ITEMS держит то же самое для пунктов меню,
// тут своя копия — секций мало и они не меняются часто).
const SECTION_PATHS = {
  leads: '/leads',
  trials: '/trials',
  students: '/students',
  teachersGroups: '/teachers-groups',
  payments: '/payments',
  reports: '/reports',
};

// Учитель в меню не видит «Дашборд» — прямой заход на '/' уводит его сразу
// в «Учителя и группы», чтобы не показывать общий дашборд по URL в обход
// меню. Тест — так же, на первый разрешённый ему раздел (staff.allowedSections);
// если у него вообще нет разрешённых разделов — понятное сообщение, не пустой дашборд.
function HomeRoute() {
  const { isTeacher, isTest, allowedSections } = useRole();
  if (isTeacher) return <Navigate to="/teachers-groups" replace />;
  if (isTest) {
    const firstPath = allowedSections.map((key) => SECTION_PATHS[key]).find(Boolean);
    if (firstPath) return <Navigate to={firstPath} replace />;
    return (
      <div className="flex h-full items-center justify-center p-10 text-center text-[15px] text-muted">
        Нет доступных разделов — обратитесь к администратору.
      </div>
    );
  }
  return <DashboardPage />;
}

function App() {
  return (
    <AuthProvider>
      <BranchProvider>
        <ToastProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />

              <Route
                element={
                  <ProtectedRoute>
                    <AppShell />
                  </ProtectedRoute>
                }
              >
                <Route index element={<HomeRoute />} />
                <Route
                  path="leads"
                  element={
                    <ProtectedRoute section="leads">
                      <LeadsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="trials"
                  element={
                    <ProtectedRoute section="trials">
                      <TrialsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="students"
                  element={
                    <ProtectedRoute section="students">
                      <StudentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="students/:id"
                  element={
                    <ProtectedRoute section="students">
                      <StudentDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="teachers-groups"
                  element={
                    <ProtectedRoute section="teachersGroups">
                      <TeachersAndGroupsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="groups"
                  element={
                    <ProtectedRoute section="teachersGroups">
                      <GroupsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="groups/:id"
                  element={
                    <ProtectedRoute section="teachersGroups">
                      <GroupDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="teachers"
                  element={
                    <ProtectedRoute section="teachersGroups">
                      <TeachersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="teachers/:id"
                  element={
                    <ProtectedRoute section="teachersGroups">
                      <TeacherDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="courses"
                  element={
                    <ProtectedRoute allow={['ceo', 'manager', 'admin']}>
                      <CoursesPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="rooms"
                  element={
                    <ProtectedRoute allow={['ceo', 'manager', 'admin']}>
                      <RoomsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="payments"
                  element={
                    <ProtectedRoute section="payments">
                      <PaymentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reports"
                  element={
                    <ProtectedRoute section="reports">
                      <ReportsLandingPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reports/list"
                  element={
                    <ProtectedRoute section="reports">
                      <ReportsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reports/stats"
                  element={
                    <ProtectedRoute section="reports">
                      <StatsDepartmentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="reports/stats/sales"
                  element={
                    <ProtectedRoute section="reports">
                      <SalesStatsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <ProtectedRoute allow={['ceo', 'manager', 'admin']}>
                      <SettingsPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="settings/ui" element={<UiKitShowcasePage />} />
              </Route>
            </Routes>
          </HashRouter>
        </ToastProvider>
      </BranchProvider>
    </AuthProvider>
  );
}

export default App;
