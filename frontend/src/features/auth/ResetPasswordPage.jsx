import { Navigate } from 'react-router';

/**
 * Password resets now use a 6-digit emailed code on the Forgot password page. Old reset links (from emails sent
 * before) land here and are sent there to request a code.
 */
export default function ResetPasswordPage() {
  return <Navigate to="/forgot-password" replace />;
}
