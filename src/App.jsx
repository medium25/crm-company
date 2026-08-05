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
import { SettingsPage } from './pages/SettingsPage.jsx';
import { UiKitShowcasePage } from './pages/UiKitShowcasePage.jsx';

// Учитель в меню не видит «Дашборд» — прямой заход на '/' уводит его сразу
// в «Учителя и группы», чтобы не показывать общий дашборд по URL в обход меню.
function HomeRoute() {
  const { isTeacher } = useRole();
  return isTeacher ? <Navigate to="/teachers-groups" replace /> : <DashboardPage />;
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
                <Route path="leads" element={<LeadsPage />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="students/:id" element={<StudentDetailPage />} />
                <Route path="teachers-groups" element={<TeachersAndGroupsPage />} />
                <Route path="groups" element={<GroupsPage />} />
                <Route path="groups/:id" element={<GroupDetailPage />} />
                <Route path="teachers" element={<TeachersPage />} />
                <Route path="teachers/:id" element={<TeacherDetailPage />} />
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
                <Route path="payments" element={<PaymentsPage />} />
                <Route path="reports" element={<ReportsPage />} />
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
