import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Navigate, Outlet, useLocation } from 'react-router';
import { FullScreenLoader } from '../../components/StateViews.jsx';
import { refreshPlatformToken } from './platformApi.js';
import { platformSessionEnded } from './platformSlice.js';

/** Restores a Super Admin session from the refresh cookie once per page load. */
export function useAdminBootstrap() {
  const status = useSelector((s) => s.platform.status);
  const dispatch = useDispatch();
  useEffect(() => {
    if (status === 'checking') refreshPlatformToken().catch(() => dispatch(platformSessionEnded()));
  }, [status, dispatch]);
  return status;
}

export const isAdminPath = (pathname = '') => pathname === '/admin' || pathname.startsWith('/admin/');

export function RequireAdmin() {
  const status = useAdminBootstrap();
  const location = useLocation();
  if (status === 'checking') return <FullScreenLoader />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
