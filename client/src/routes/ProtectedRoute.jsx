import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export const ProtectedRoute = ({ allowedRoles, children, fallbackPath }) => {
  const location = useLocation();
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const defaultFallback = user.role === 'superadmin' ? '/platform/organizations' : '/dashboard';
    const target = fallbackPath || defaultFallback;
    return <Navigate to={target} replace />;
  }

  return children;
};
