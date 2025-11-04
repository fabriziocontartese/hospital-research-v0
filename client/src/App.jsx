import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { ProtectedRoute } from './routes/ProtectedRoute';
import Login from './pages/Login';
import OrgRegister from './pages/OrgRegister';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Studies from './pages/Studies';
import StudyDetail from './pages/StudyDetail';
import FormRunner from './pages/FormRunner';
import Population from './pages/Population';
import Patient from './pages/Patient';
import Tasks from './pages/Tasks';
import PlatformOrganizations from './pages/PlatformOrganizations';
import { MainLayout } from './components/MainLayout';

const App = () => {
  const { isAuthenticated, loading, user } = useAuth();
  let defaultRoute = '/dashboard';
  if (user?.role === 'staff') {
    defaultRoute = '/tasks';
  } else if (user?.role === 'superadmin') {
    defaultRoute = '/platform/organizations';
  }

  if (loading) {
    return null;
  }

  return (
    <>
      {isAuthenticated ? (
        <MainLayout>
          <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />
            <Route
              path="/platform/organizations"
              element={
                <ProtectedRoute allowedRoles={['superadmin']} fallbackPath="/platform/organizations">
                  <PlatformOrganizations />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin', 'researcher']} fallbackPath="/tasks">
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['admin']} fallbackPath="/tasks">
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studies"
              element={
                <ProtectedRoute allowedRoles={['admin', 'researcher']} fallbackPath="/tasks">
                  <Studies />
                </ProtectedRoute>
              }
            />
            <Route
              path="/studies/:studyId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'researcher']} fallbackPath="/tasks">
                  <StudyDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/population"
              element={
                <ProtectedRoute allowedRoles={['admin', 'researcher', 'staff']}>
                  <Population />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patients/:pid"
              element={
                <ProtectedRoute allowedRoles={['admin', 'researcher', 'staff']}>
                  <Patient />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tasks"
              element={
                <ProtectedRoute allowedRoles={['admin', 'researcher', 'staff']}>
                  <Tasks />
                </ProtectedRoute>
              }
            />
            <Route
              path="/forms/:formId"
              element={
                <ProtectedRoute allowedRoles={['admin', 'researcher', 'staff']}>
                  <FormRunner />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
          </Routes>
        </MainLayout>
      ) : (
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/request-access" element={<OrgRegister />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </>
  );
};

export default App;
