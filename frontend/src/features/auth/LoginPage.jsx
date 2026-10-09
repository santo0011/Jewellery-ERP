import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Checkbox, FormControlLabel, Link, Stack } from '@mui/material';
import { loginSchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { Link as RouterLink } from 'react-router';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { branchSelected, signedIn } from '../../store/authSlice.js';
import { platformSignedIn } from '../platform/platformSlice.js';
import { clearSignOutReason, readSignOutReason } from '../../services/http.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useAuthConfigQuery, useLoginMutation } from './authApi.js';
import AuthCard from './AuthCard.jsx';

export default function LoginPage() {
  const dispatch = useDispatch();
  const [login, { error, isLoading, reset }] = useLoginMutation();
  // Read on render (safe to run twice), cleared once shown so it does not reappear on the next visit.
  const [signedOutReason] = useState(readSignOutReason);
  useEffect(clearSignOutReason, []);
  const { data: config } = useAuthConfigQuery();
  const { control, handleSubmit, setError } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const { accessToken, realm } = await login(values).unwrap();
      // GuestOnly then routes a Super Admin to /admin and everyone else into the store app.
      if (realm === 'platform') {
        dispatch(platformSignedIn(accessToken));
      } else {
        dispatch(branchSelected(null)); // a new sign-in starts from this user's own default branch, not the previous user's
        dispatch(signedIn(accessToken));
      }
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <AuthCard
      title="Sign in"
      subtitle="Welcome back. Sign in to manage your store."
      footer={
        config?.publicSignup && (
          <>
            New to the platform?{' '}
            <Link component={RouterLink} to="/register" color="accent" sx={{ fontWeight: 600 }}>
              Create your business account
            </Link>
          </>
        )
      }
    >
      <Stack component="form" spacing={2} noValidate onSubmit={onSubmit} onChange={() => error && reset()}>
        {error ? <Alert severity="error">{getErrorMessage(error)}</Alert> : signedOutReason && <Alert severity="warning">{signedOutReason}</Alert>}
        <RHFTextField control={control} name="email" label="Email" type="email" autoComplete="email" autoFocus />
        <PasswordField control={control} name="password" label="Password" autoComplete="current-password" />
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Controller
            name="rememberMe"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Checkbox checked={field.value} onChange={(e) => field.onChange(e.target.checked)} size="small" />}
                label="Keep me signed in"
                slotProps={{ typography: { variant: 'body2' } }}
              />
            )}
          />
          <Link component={RouterLink} to="/forgot-password" variant="body2" color="accent">
            Forgot password?
          </Link>
        </Stack>
        <Button type="submit" variant="contained" size="large" loading={isLoading} fullWidth>
          Sign in
        </Button>
      </Stack>
    </AuthCard>
  );
}
