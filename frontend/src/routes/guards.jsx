import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router';
import { EmptyState, FullScreenLoader } from '../components/StateViews.jsx';
import { isAdminPath, useAdminBootstrap } from '../features/platform/adminGuards.jsx';
import { usePermission } from '../hooks/usePermission.js';
import { refreshAccessToken } from '../services/http.js';
import { sessionEnded } from '../store/authSlice.js';

export function AuthBootstrap({ children }) {
  const status = useSelector((s) => s.auth.status);
  const dispatch = useDispatch();

  useEffect(() => {
    if (status !== 'checking') return;
    refreshAccessToken().catch(() => dispatch(sessionEnded()));
  }, [status, dispatch]);

  return status === 'checking' ? <FullScreenLoader /> : children;
}

export function RequireAuth() {
  const status = useSelector((s) => s.auth.status);
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

/** Sign-in pages: send an already signed-in store user or Super Admin back to their own area. */
export function GuestOnly() {
  const status = useSelector((s) => s.auth.status);
  const adminStatus = useAdminBootstrap();
  const location = useLocation();
  const from = location.state?.from?.pathname;
  if (status === 'authenticated') return <Navigate to={from && !isAdminPath(from) ? from : '/'} replace />;
  if (adminStatus === 'checking') return <FullScreenLoader />;
  if (adminStatus === 'authenticated') return <Navigate to={isAdminPath(from) ? from : '/admin'} replace />;
  return <Outlet />;
}

export function RequirePermission({ perm, children }) {
  return usePermission(perm) ? (
    children
  ) : (
    <EmptyState icon={LockOutlinedIcon} title="Access restricted" description="You do not have permission to view this page. Ask your administrator for access." />
  );
}
