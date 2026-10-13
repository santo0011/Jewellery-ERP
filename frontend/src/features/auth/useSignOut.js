import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { sessionEnded } from '../../store/authSlice.js';
import { useLogoutMutation } from './authApi.js';

/** Ends this device's session and returns to the login page. */
export function useSignOut() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [logout, { isLoading }] = useLogoutMutation();

  const signOut = async () => {
    await logout();
    dispatch(sessionEnded());
    navigate('/login', { replace: true });
  };

  return [signOut, isLoading];
}
