import { zodResolver } from '@hookform/resolvers/zod';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { changePasswordSchema, updateOrganisationSchema, updateProfileSchema } from '@jerp/shared/schemas';
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
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { sessionEnded } from '../../store/authSlice.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { describeDevice, formatDateTime } from '../../utils/format.js';
import { tokens } from '../../theme/tokens.js';
import { useChangePasswordMutation, useLogoutAllMutation, useRevokeSessionMutation, useSessionsQuery, useUpdateProfileMutation } from '../auth/authApi.js';
import { useSignOut } from '../auth/useSignOut.js';
import { useOrganisationQuery, useUpdateOrganisationMutation } from '../settings/organisationApi.js';
import { toFormValues as organisationFormValues } from '../settings/OrganisationPage.jsx';
import LogoCard from '../settings/LogoCard.jsx';

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

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

function ProfileHero({ session }) {
  const { user, organisation } = session;
  const [signOut, signingOut] = useSignOut();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const activeBranch = session.branches.find((b) => sameId(b.id, session.activeBranchId));

  return (
    <Card sx={{ background: tokens.sidebar.surface, color: tokens.sidebar.text, position: 'relative', overflow: 'hidden', border: 0 }}>
      <Box sx={{ position: 'absolute', inset: 0, background: tokens.sidebar.glow, pointerEvents: 'none' }} />
      <CardContent sx={{ position: 'relative', p: { xs: 2.5, sm: 3.5 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 3 }} sx={{ alignItems: { sm: 'center' } }}>
          <Avatar sx={{ width: 76, height: 76, background: tokens.sidebar.goldGradient, color: '#171717', fontSize: '1.625rem', fontWeight: 700, boxShadow: '0 6px 20px rgba(201, 162, 39, 0.3)' }}>{initials(user.name)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h3" sx={{ color: '#FFFFFF' }} noWrap>
              {user.name}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.sidebar.muted, mt: 0.25 }} noWrap>
              {user.email}
              {user.mobile ? ` · ${user.mobile}` : ''}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
              {user.isOwner && <Chip label="Owner" size="small" sx={{ background: tokens.sidebar.goldGradient, color: '#171717', fontWeight: 600 }} />}
              {user.roles.map((r) => (
                <Chip key={r.id} label={r.name} size="small" variant="outlined" sx={{ color: tokens.sidebar.text, borderColor: 'rgba(201, 162, 39, 0.45)' }} />
              ))}
              {user.branchLogin && <Chip label="Branch login" size="small" variant="outlined" sx={{ color: tokens.sidebar.text, borderColor: tokens.sidebar.divider }} />}
            </Stack>
          </Box>
          <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
            <Typography variant="body2" sx={{ color: tokens.sidebar.text, fontWeight: 600 }}>
              {organisation.name}
            </Typography>
            {activeBranch && (
              <Typography variant="caption" sx={{ color: tokens.sidebar.muted }}>
                Working in {activeBranch.name}
              </Typography>
            )}
            <Button
              variant="outlined"
              startIcon={<LogoutRoundedIcon />}
              onClick={() => setConfirmSignOut(true)}
              sx={{ mt: 0.5, color: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.25)', '&:hover': { borderColor: tokens.light.gold, bgcolor: 'rgba(201, 162, 39, 0.1)' } }}
            >
              Sign out
            </Button>
          </Stack>
        </Stack>
      </CardContent>
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="You will be signed out on this device. Any unsaved changes will be lost."
        confirmLabel="Sign out"
        danger
        loading={signingOut}
        onConfirm={signOut}
        onClose={() => setConfirmSignOut(false)}
      />
    </Card>
  );
}

function StatTile({ icon: Icon, label, value, hint }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 2.25, display: 'flex', gap: 1.75, alignItems: 'flex-start' }}>
        <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(201, 162, 39, 0.12)', color: 'accent.main' }}>
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="textSecondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 600 }}>
            {label}
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
            {value}
          </Typography>
          {hint && (
            <Typography variant="caption" color="textSecondary" noWrap component="div">
              {hint}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

function ProfileStats({ session }) {
  const { user, subscription, branches } = session;
  const { data: sessions } = useSessionsQuery();

  const planHint = !subscription
    ? null
    : subscription.expired
      ? 'Expired'
      : subscription.daysLeft != null
        ? `${subscription.daysLeft} day${subscription.daysLeft === 1 ? '' : 's'} left`
        : subscription.status;

  const stats = [
    { icon: AccessTimeRoundedIcon, label: 'Last sign-in', value: formatDateTime(user.lastLoginAt) },
    { icon: DevicesRoundedIcon, label: 'Active devices', value: sessions ? sessions.length : '—', hint: 'Signed in right now' },
    {
      icon: StorefrontOutlinedIcon,
      label: 'Branch access',
      value: user.allBranches ? 'All branches' : `${branches.length} branch${branches.length === 1 ? '' : 'es'}`,
      hint: branches.map((b) => b.name).join(', '),
    },
    subscription && { icon: WorkspacePremiumOutlinedIcon, label: 'Plan', value: subscription.planName, hint: planHint },
  ].filter(Boolean);

  return (
    <Grid container spacing={2}>
      {stats.map((s) => (
        <Grid key={s.label} size={{ xs: 12, sm: 6, lg: 12 / stats.length }}>
          <StatTile {...s} />
        </Grid>
      ))}
    </Grid>
  );
}

function DetailRow({ label, value, action }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'center', py: 1.25, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <Typography variant="body2" color="textSecondary">
        {label}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, textAlign: 'right' }}>
          {value || '—'}
        </Typography>
        {action}
      </Stack>
    </Stack>
  );
}

const businessNameSchema = updateOrganisationSchema.pick({ name: true });

function BusinessNameDialog({ open, onClose }) {
  const { data: organisation, isLoading, error } = useOrganisationQuery(undefined, { skip: !open });
  const [update, { isLoading: saving }] = useUpdateOrganisationMutation();
  const { control, handleSubmit, setError, formState } = useForm({
    resolver: zodResolver(businessNameSchema),
    values: { name: organisation?.name ?? '' },
  });

  // PATCH /organisation validates the full record, so send the current details with the new name.
  const onSubmit = handleSubmit(async ({ name }) => {
    try {
      await update({ ...organisationFormValues(organisation), name }).unwrap();
      toast.success('Business name updated');
      onClose();
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>Edit business name</DialogTitle>
        <DialogContent>
          {isLoading && <LoadingState />}
          {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
          {organisation && <RHFTextField control={control} name="name" label="Business name" autoFocus helperText="Shown in the app, on invoices and on reports" sx={{ mt: 1 }} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={saving} disabled={!organisation || !formState.isDirty}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function AccountDetails({ session }) {
  const { user, organisation, branches } = session;
  const canEditOrganisation = usePermission('organisation.edit');
  const [editingName, setEditingName] = useState(false);
  const findBranch = (id) => branches.find((b) => sameId(b.id, id))?.name;

  return (
    <Box>
      <DetailRow
        label="Business name"
        value={organisation.name}
        action={
          canEditOrganisation && (
            <Tooltip title="Edit business name">
              <IconButton size="small" onClick={() => setEditingName(true)} aria-label="Edit business name">
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )
        }
      />
      {canEditOrganisation && <BusinessNameDialog open={editingName} onClose={() => setEditingName(false)} />}
      <DetailRow label="Legal name" value={organisation.legalName} />
      <DetailRow label="GSTIN" value={organisation.gstin} />
      <DetailRow label="Current branch" value={findBranch(session.activeBranchId)} />
      <DetailRow label="Default branch" value={findBranch(user.defaultBranchId)} />
      <DetailRow label="Roles" value={user.roles.map((r) => r.name).join(', ')} />
      <DetailRow label="Currency · Timezone" value={[organisation.currency, organisation.timezone].filter(Boolean).join(' · ')} />
    </Box>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const canEditOrganisation = usePermission('organisation.edit');

  return (
    <>
      <PageHeader title="Profile & security" subtitle="Manage your personal details, password and signed-in devices." />
      <Stack spacing={3}>
        <ProfileHero session={session} />
        {session.user.mustChangePassword && <Alert severity="warning">Your administrator has asked you to change your password. Please set a new one below.</Alert>}
        <ProfileStats session={session} />
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
            <Stack spacing={3}>
              <LogoCard
                canEdit={canEditOrganisation}
                title="Organisation logo"
                caption={canEditOrganisation ? 'Shown at the top of the sidebar and printed on invoices. PNG, JPEG or WebP up to 1 MB; a square logo looks best.' : 'Shown at the top of the sidebar and printed on invoices. Ask an administrator to change it.'}
              />
              <Section title="Account" description="Your organisation, branch and role.">
                <AccountDetails session={session} />
              </Section>
              <Section title="Signed-in devices" description="Sign out of any device you do not recognise.">
                <SessionsList />
              </Section>
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    </>
  );
}
