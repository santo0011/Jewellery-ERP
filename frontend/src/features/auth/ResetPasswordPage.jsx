import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Link, Stack } from '@mui/material';
import { passwordSchema } from '@jerp/shared/schemas';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import PasswordField from '../../components/form/PasswordField.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { useResetPasswordMutation } from './authApi.js';
import AuthCard from './AuthCard.jsx';

const schema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [resetPassword, { error, isLoading }] = useResetPasswordMutation();
  const { control, handleSubmit } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' } });

  const onSubmit = handleSubmit(async ({ password }) => {
    const res = await resetPassword({ token, password }).unwrap().catch(() => null);
    if (res) {
      toast.success(res.message);
      navigate('/login', { replace: true });
    }
  });

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="For your security, all devices will be signed out."
      footer={
        <Link component={RouterLink} to="/login" color="accent" sx={{ fontWeight: 600 }}>
          Back to sign in
        </Link>
      }
    >
      {token.length < 20 ? (
        <Alert severity="error">
          This reset link is invalid.{' '}
          <Link component={RouterLink} to="/forgot-password">
            Request a new one
          </Link>
          .
        </Alert>
      ) : (
        <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
          {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
          <PasswordField control={control} name="password" label="New password" autoComplete="new-password" helperText="At least 6 characters" autoFocus />
          <PasswordField control={control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
          <Button type="submit" variant="contained" size="large" loading={isLoading} fullWidth>
            Update password
          </Button>
        </Stack>
      )}
    </AuthCard>
  );
}
