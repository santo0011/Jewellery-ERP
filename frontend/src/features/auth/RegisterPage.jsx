import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Grid, Link, Typography } from '@mui/material';
import { INDIAN_STATES } from '@jerp/shared';
import { registerOrganisationSchema } from '@jerp/shared/schemas';
import { useForm } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { Link as RouterLink } from 'react-router';
import { z } from 'zod';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { signedIn } from '../../store/authSlice.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useAuthConfigQuery, useRegisterMutation } from './authApi.js';
import AuthCard from './AuthCard.jsx';

const schema = registerOrganisationSchema
  .extend({ confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }));

export default function RegisterPage() {
  const dispatch = useDispatch();
  const [register, { error, isLoading }] = useRegisterMutation();
  const { data: config, isLoading: loadingConfig } = useAuthConfigQuery();
  const { control, handleSubmit, setError } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { organisationName: '', ownerName: '', email: '', mobile: '', stateCode: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ confirmPassword, ...values }) => {
    try {
      const { accessToken } = await register(values).unwrap();
      dispatch(signedIn(accessToken));
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  if (!loadingConfig && !config?.publicSignup) {
    return (
      <AuthCard title="Accounts are created by invitation" subtitle="Your business account is set up by the platform administrator. Ask them for your sign-in details.">
        <Link component={RouterLink} to="/login" color="accent" sx={{ fontWeight: 600 }}>
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your business account"
      subtitle="Start a free trial. Your head-office branch and standard roles are set up automatically."
      footer={
        <>
          Already have an account?{' '}
          <Link component={RouterLink} to="/login" color="accent" sx={{ fontWeight: 600 }}>
            Sign in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit}>
        <Grid container spacing={2}>
          {error && (
            <Grid size={12}>
              <Alert severity="error">{getErrorMessage(error)}</Alert>
            </Grid>
          )}
          <Grid size={12}>
            <RHFTextField control={control} name="organisationName" label="Business name" autoComplete="organization" autoFocus />
          </Grid>
          <Grid size={12}>
            <RHFTextField control={control} name="ownerName" label="Your name" autoComplete="name" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFTextField control={control} name="mobile" label="Mobile" autoComplete="tel" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <RHFSelect control={control} name="stateCode" label="State" options={STATE_OPTIONS} placeholder="Select state" />
          </Grid>
          <Grid size={12}>
            <RHFTextField control={control} name="email" label="Work email" type="email" autoComplete="email" helperText="You will use this to sign in" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <PasswordField control={control} name="password" label="Password" autoComplete="new-password" helperText="At least 6 characters" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <PasswordField control={control} name="confirmPassword" label="Confirm password" autoComplete="new-password" />
          </Grid>
          <Grid size={12}>
            <Button type="submit" variant="contained" size="large" loading={isLoading} fullWidth>
              Create account
            </Button>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1.5, textAlign: 'center' }}>
              GST state is used for tax calculations on invoices.
            </Typography>
          </Grid>
        </Grid>
      </form>
    </AuthCard>
  );
}
