import { zodResolver } from '@hookform/resolvers/zod';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Alert, Button, Checkbox, FormControlLabel, InputAdornment, Link, Stack, Typography } from '@mui/material';
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
      eyebrow="Welcome back"
      title="Sign in"
      subtitle="Manage your store, stock and sales in one place."
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
        <RHFTextField
          control={control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><MailOutlineRoundedIcon fontSize="small" sx={{ color: 'text.secondary' }} /></InputAdornment> } }}
        />
        <PasswordField control={control} name="password" label="Password" autoComplete="current-password" startIcon={LockOutlinedIcon} />
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
        <Button
          type="submit"
          variant="contained"
          size="large"
          loading={isLoading}
          fullWidth
          endIcon={!isLoading && <ArrowForwardRoundedIcon />}
          sx={{
            minHeight: { xs: 46, md: 42 },
            fontSize: { xs: '0.975rem', md: '0.9375rem' },
            letterSpacing: '0.02em',
            borderRadius: 2.5,
            background: 'linear-gradient(135deg, var(--brand-light) 0%, var(--brand) 45%, var(--brand-deep) 100%)',
            color: 'var(--brand-contrast)',
            boxShadow: '0 10px 24px -10px rgba(var(--brand-rgb), 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
            '&:hover': { boxShadow: '0 14px 30px -10px rgba(var(--brand-rgb), 0.95), inset 0 1px 0 rgba(255, 255, 255, 0.35)', filter: 'brightness(1.04)' },
            '& .MuiButton-endIcon': { transition: 'transform 160ms ease' },
            '&:hover .MuiButton-endIcon': { transform: 'translateX(3px)' },
          }}
        >
          Sign in
        </Button>
        <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'center', alignItems: 'center', color: 'text.secondary', pt: 0.5 }}>
          <VerifiedUserOutlinedIcon sx={{ fontSize: 15, color: 'var(--brand-strong)' }} />
          <Typography variant="caption">Encrypted, secure sign-in</Typography>
        </Stack>
      </Stack>
    </AuthCard>
  );
}
