import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Link, Stack } from '@mui/material';
import { forgotPasswordSchema } from '@jerp/shared/schemas';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink } from 'react-router';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { useForgotPasswordMutation } from './authApi.js';
import AuthCard from './AuthCard.jsx';

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(null);
  const [forgotPassword, { error, isLoading }] = useForgotPasswordMutation();
  const { control, handleSubmit } = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  const onSubmit = handleSubmit(async (values) => {
    const res = await forgotPassword(values).unwrap().catch(() => null);
    if (res) setSent(res.message);
  });

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter the email you sign in with and we will send you a reset link."
      footer={
        <Link component={RouterLink} to="/login" color="accent" sx={{ fontWeight: 600 }}>
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert severity="success">{sent}</Alert>
      ) : (
        <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
          {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
          <RHFTextField control={control} name="email" label="Email" type="email" autoComplete="email" autoFocus />
          <Button type="submit" variant="contained" size="large" loading={isLoading} fullWidth>
            Send reset link
          </Button>
        </Stack>
      )}
    </AuthCard>
  );
}
