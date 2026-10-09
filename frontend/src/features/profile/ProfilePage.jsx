import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardContent, Chip, Divider, Grid, List, ListItem, ListItemText, Stack, TextField, Typography } from '@mui/material';
import { changePasswordSchema, updateProfileSchema } from '@jerp/shared/schemas';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { sessionEnded } from '../../store/authSlice.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { describeDevice, formatDateTime } from '../../utils/format.js';
import { useChangePasswordMutation, useLogoutAllMutation, useRevokeSessionMutation, useSessionsQuery, useUpdateProfileMutation } from '../auth/authApi.js';

const passwordFormSchema = changePasswordSchema
  .and(z.object({ confirmPassword: z.string() }))
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

function Section({ title, description, children }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Typography variant="h4">{title}</Typography>
        {description && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
        <Divider sx={{ my: 2.5 }} />
        {children}
      </CardContent>
    </Card>
  );
}

function ProfileForm({ user }) {
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const { control, handleSubmit, setError, formState, reset } = useForm({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user.name, mobile: user.mobile ?? '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await updateProfile(values).unwrap();
      reset({ name: res.name, mobile: res.mobile });
      toast.success('Profile updated');
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
      <TextField label="Email" value={user.email} disabled helperText="Contact your administrator to change your sign-in email" />
      <RHFTextField control={control} name="name" label="Full name" autoComplete="name" />
      <RHFTextField control={control} name="mobile" label="Mobile" autoComplete="tel" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button type="submit" variant="contained" loading={isLoading} disabled={!formState.isDirty}>
          Save changes
        </Button>
      </Stack>
    </Stack>
  );
}

export function ChangePasswordForm() {
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  const { control, handleSubmit, setError, reset } = useForm({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await changePassword({ currentPassword, newPassword }).unwrap();
      reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
      <PasswordField control={control} name="currentPassword" label="Current password" autoComplete="current-password" />
      <PasswordField control={control} name="newPassword" label="New password" autoComplete="new-password" helperText="At least 6 characters" />
      <PasswordField control={control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button type="submit" variant="contained" loading={isLoading}>
          Change password
        </Button>
      </Stack>
    </Stack>
  );
}

function SessionsList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useSessionsQuery();
  const [revokeSession, { isLoading: revoking, originalArgs }] = useRevokeSessionMutation();
  const [logoutAll, { isLoading: loggingOut }] = useLogoutAllMutation();
  const [confirmAll, setConfirmAll] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const revoke = async (id) => {
    try {
      await revokeSession(id).unwrap();
      toast.success('Device signed out');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const signOutEverywhere = async () => {
    try {
      await logoutAll().unwrap();
      dispatch(sessionEnded());
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <List disablePadding>
        {data.map((s) => (
          <ListItem
            key={s.id}
            disableGutters
            divider
            secondaryAction={
              s.current ? (
                <Chip label="This device" size="small" color="primary" />
              ) : (
                <Button size="small" color="error" onClick={() => revoke(s.id)} loading={revoking && originalArgs === s.id}>
                  Sign out
                </Button>
              )
            }
          >
            <ListItemText
              primary={describeDevice(s.userAgent)}
              secondary={`${s.ip ?? 'Unknown IP'} · Last active ${formatDateTime(s.lastUsedAt)}`}
              slotProps={{ primary: { sx: { fontWeight: 500 } } }}
              sx={{ pr: 12 }}
            />
          </ListItem>
        ))}
      </List>
      <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: 2 }}>
        <Button color="error" variant="outlined" onClick={() => setConfirmAll(true)}>
          Sign out of all devices
        </Button>
      </Stack>
      <ConfirmDialog
        open={confirmAll}
        title="Sign out everywhere?"
        message="You will be signed out on every device, including this one."
        confirmLabel="Sign out all"
        danger
        loading={loggingOut}
        onConfirm={signOutEverywhere}
        onClose={() => setConfirmAll(false)}
      />
    </>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();

  return (
    <>
      <PageHeader title="Profile & security" subtitle="Manage your personal details, password and signed-in devices." />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Stack spacing={3}>
            <Section title="Personal details">
              <ProfileForm user={session.user} />
            </Section>
            <Section title="Password" description="Changing your password signs you out on other devices.">
              <ChangePasswordForm />
            </Section>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Section title="Signed-in devices" description="Sign out of any device you do not recognise.">
            <SessionsList />
          </Section>
        </Grid>
      </Grid>
    </>
  );
}
