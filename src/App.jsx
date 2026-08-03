import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth.js';
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
import { CoursesPage } from './pages/CoursesPage.jsx';
import { RoomsPage } from './pages/RoomsPage.jsx';
import { PaymentsPage } from './pages/PaymentsPage.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { UiKitShowcasePage } from './pages/UiKitShowcasePage.jsx';

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
                <Route index element={<DashboardPage />} />
                <Route path="leads" element={<LeadsPage />} />
                <Route path="students" element={<StudentsPage />} />
                <Route path="students/:id" element={<StudentDetailPage />} />
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
