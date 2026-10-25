import { zodResolver } from '@hookform/resolvers/zod';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { DiamondMark } from '../../components/Wordmark.jsx';
import { useOrganisationLogo } from '../../hooks/useOrganisationLogo.js';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton, Stack, TextField, Tooltip, Typography,
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
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useTabParam } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { sessionEnded } from '../../store/authSlice.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { describeDevice, formatDate, formatDateTime } from '../../utils/format.js';
import { stateName } from '@jerp/shared';
import { tokens } from '../../theme/tokens.js';
import { useChangePasswordMutation, useLogoutAllMutation, useRevokeSessionMutation, useSessionsQuery, useUpdateProfileMutation } from '../auth/authApi.js';
import { useSignOut } from '../auth/useSignOut.js';
import { useOrganisationQuery, useUpdateOrganisationMutation } from '../settings/organisationApi.js';
import { toFormValues as organisationFormValues } from '../settings/OrganisationPage.jsx';
import LogoCard from '../settings/LogoCard.jsx';
import ViewTabs from '../../components/ViewTabs.jsx';
import { getLocale, t, tValue } from '../../i18n/index.js';

const passwordFormSchema = changePasswordSchema
  .and(z.object({ confirmPassword: z.string() }))
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: t('Passwords do not match') });

function Section({ title, description, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 }, '&:last-child': { pb: { xs: 2, sm: 3 } } }}>
        <Typography variant="h4">{title}</Typography>
        {description && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5, display: { xs: 'none', sm: 'block' } }}>
            {description}
          </Typography>
        )}
        <Divider sx={{ my: { xs: 2, sm: 2.5 } }} />
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
      toast.success(t('Profile updated'));
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
      <TextField label={t('Email')} value={user.email} disabled helperText={t('Contact your administrator to change your sign-in email')} />
      <RHFTextField control={control} name="name" label={t('Full name')} autoComplete="name" />
      <RHFTextField control={control} name="mobile" label={t('Mobile')} autoComplete="tel" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button type="submit" variant="contained" loading={isLoading} disabled={!formState.isDirty}>
          {t('Save changes')}
        </Button>
      </Stack>
    </Stack>
  );
}

/** `firstLogin`: setting their own password after signing in with the temporary one — the current one is not asked again. */
export function ChangePasswordForm({ firstLogin = false }) {
  const [changePassword, { isLoading }] = useChangePasswordMutation();
  // Signed in with an emailed code (forgot password): a new password can be set without the old one.
  const { data: session } = useSession();
  const viaCode = Boolean(session?.user?.signedInWithCode);
  const noCurrent = viaCode || firstLogin;
  const { control, handleSubmit, setError, reset } = useForm({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await changePassword({ currentPassword: noCurrent ? '' : currentPassword, newPassword }).unwrap();
      reset();
      toast.success(t('Password changed. Other devices have been signed out.'));
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={onSubmit}>
      {firstLogin ? null : viaCode ? (
        <Alert severity="info" variant="outlined">
          {t('You signed in with a code sent to your email, so the current password is not needed. Set a new one below.')}
        </Alert>
      ) : (
        <PasswordField control={control} name="currentPassword" label={t('Current password')} autoComplete="current-password" />
      )}
      <PasswordField control={control} name="newPassword" label={t('New password')} autoComplete="new-password" helperText={t('At least 6 characters')} />
      <PasswordField control={control} name="confirmPassword" label={t('Confirm new password')} autoComplete="new-password" />
      <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
        <Button type="submit" variant="contained" loading={isLoading}>
          {firstLogin ? t('Set password') : t('Change password')}
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
      toast.success(t('Device signed out'));
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
      {/* Each device: a phone or computer icon, what it is, where and when it was last used, and sign out. */}
      <Stack divider={<Divider flexItem />}>
        {data.map((s) => {
          const DeviceIcon = /mobile|android|iphone|ipad/i.test(s.userAgent ?? '') ? SmartphoneOutlinedIcon : ComputerOutlinedIcon;
          return (
            <Stack key={s.id} direction="row" spacing={1.5} sx={{ py: 1.5, alignItems: 'center' }}>
              <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: s.current ? 'rgba(var(--brand-rgb), 0.14)' : 'action.hover', color: s.current ? 'var(--brand-strong)' : 'text.secondary' }}>
                <DeviceIcon sx={{ fontSize: 21 }} />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {describeDevice(s.userAgent)}
                  </Typography>
                  {s.current && <Chip label={t('This device')} size="small" color="primary" sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 600 }} />}
                </Stack>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', lineHeight: 1.4, mt: 0.25 }}>
                  {s.ip ?? t('Unknown IP')} {t('· Last active {{lastUsedAt}}', { lastUsedAt: formatDateTime(s.lastUsedAt) })}
                </Typography>
              </Box>
              {!s.current && (
                <Button size="small" color="error" onClick={() => revoke(s.id)} loading={revoking && originalArgs === s.id} sx={{ flexShrink: 0 }}>
                  {t('Sign out')}
                </Button>
              )}
            </Stack>
          );
        })}
      </Stack>
      <Stack direction="row" sx={{ justifyContent: 'flex-end', mt: 1.5 }}>
        <Button color="error" variant="outlined" onClick={() => setConfirmAll(true)}>
          {t('Sign out of all devices')}
        </Button>
      </Stack>
      <ConfirmDialog
        open={confirmAll}
        title={t('Sign out everywhere?')}
        message={t('You will be signed out on every device, including this one.')}
        confirmLabel={t('Sign out all')}
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
      {/* Phones: a short banner — small avatar beside the name, the organisation and sign out in one row below. */}
      <CardContent sx={{ position: 'relative', p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 2.5 }} sx={{ alignItems: { sm: 'center' } }}>
          <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Avatar sx={{ width: { xs: 52, sm: 60 }, height: { xs: 52, sm: 60 }, flexShrink: 0, background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', fontSize: { xs: '1.125rem', sm: '1.375rem' }, fontWeight: 700, boxShadow: '0 6px 20px rgba(var(--brand-rgb), 0.3)' }}>{initials(user.name)}</Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h3" sx={{ color: '#FFFFFF' }} noWrap>
              {user.name}
            </Typography>
            <Typography variant="body2" sx={{ color: tokens.sidebar.muted, mt: 0.25 }} noWrap>
              {user.email}
              {user.mobile ? ` · ${user.mobile}` : ''}
            </Typography>
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
              {user.isOwner && <Chip label={t('Owner')} size="small" sx={{ background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', fontWeight: 600 }} />}
              {user.roles.map((r) => (
                <Chip key={r.id} label={tValue(r.name)} size="small" variant="outlined" sx={{ color: tokens.sidebar.text, borderColor: 'rgba(var(--brand-rgb), 0.45)' }} />
              ))}
              {user.branchLogin && <Chip label={t('Branch login')} size="small" variant="outlined" sx={{ color: tokens.sidebar.text, borderColor: tokens.sidebar.divider }} />}
            </Stack>
          </Box>
          </Stack>
          <Stack direction={{ xs: 'row', sm: 'column' }} spacing={{ xs: 1, sm: 1 }} sx={{ alignItems: { xs: 'center', sm: 'flex-end' }, justifyContent: 'space-between', pt: { xs: 1.5, sm: 0 }, borderTop: { xs: `1px solid ${tokens.sidebar.divider}`, sm: 0 } }}>
            <Box sx={{ minWidth: 0, textAlign: { sm: 'right' } }}>
              <Typography variant="body2" noWrap sx={{ color: tokens.sidebar.text, fontWeight: 600 }}>
                {organisation.name}
              </Typography>
              {activeBranch && (
                <Typography variant="caption" noWrap component="div" sx={{ color: tokens.sidebar.muted }}>
                  {t('Working in {{name}}', { name: activeBranch.name })}
                </Typography>
              )}
            </Box>
            <Button
              variant="outlined"
              size="small"
              startIcon={<LogoutRoundedIcon />}
              onClick={() => setConfirmSignOut(true)}
              sx={{ mt: { sm: 0.5 }, flexShrink: 0, color: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.25)', '&:hover': { borderColor: tokens.brand.main, bgcolor: 'rgba(var(--brand-rgb), 0.1)' } }}
            >
              {t('Sign out')}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
      <ConfirmDialog
        open={confirmSignOut}
        title={t('Sign out?')}
        message={t('You will be signed out on this device. Any unsaved changes will be lost.')}
        confirmLabel={t('Sign out')}
        danger
        loading={signingOut}
        onConfirm={signOut}
        onClose={() => setConfirmSignOut(false)}
      />
    </Card>
  );
}

function ProfileStats({ session }) {
  const { user, subscription, branches } = session;
  const { data: sessions } = useSessionsQuery();

  const planHint = !subscription
    ? null
    : subscription.expired
      ? t('Expired')
      : subscription.daysLeft != null
        ? (subscription.daysLeft === 1 ? t('{{daysLeft}} day left', { daysLeft: subscription.daysLeft }) : t('{{daysLeft}} days left', { daysLeft: subscription.daysLeft }))
        : subscription.status;

  const stats = [
    { icon: AccessTimeRoundedIcon, label: t('Last sign-in'), value: formatDate(user.lastLoginAt), hint: user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' }) : null, tone: 'blue' },
    { icon: DevicesRoundedIcon, label: t('Active devices'), value: sessions ? sessions.length : '—', hint: t('Signed in right now'), tone: 'green' },
    {
      icon: StorefrontOutlinedIcon,
      label: t('Branch access'),
      value: user.allBranches ? t('All branches') : (branches.length === 1 ? t('{{count}} branch', { count: branches.length }) : t('{{count}} branches', { count: branches.length })),
      hint: branches.map((b) => b.name).join(', '),
      tone: 'amber',
    },
    // The plan is the organisation's: only people with access to all branches see it.
    subscription && user.allBranches && { icon: WorkspacePremiumOutlinedIcon, label: t('Plan'), value: subscription.planName, hint: planHint, tone: subscription.expired ? 'red' : 'gold' },
  ].filter(Boolean);

  return (
    // Same cards as the dashboard.
    <Box sx={{ '& > *': { mb: '0 !important' } }}>
    <SummaryCards>
      {stats.map((s) => (
        <SummaryCard key={s.label} icon={s.icon} label={s.label} value={s.value} caption={s.hint} tone={s.tone} />
      ))}
    </SummaryCards>
    </Box>
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
      toast.success(t('Business name updated'));
      onClose();
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>{t('Edit business name')}</DialogTitle>
        <DialogContent>
          {isLoading && <LoadingState />}
          {error && <Alert severity="error">{getErrorMessage(error)}</Alert>}
          {organisation && <RHFTextField control={control} name="name" label={t('Business name')} autoFocus helperText={t('Shown in the app, on invoices and on reports')} sx={{ mt: 1 }} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={saving}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="contained" loading={saving} disabled={!organisation || !formState.isDirty}>
            {t('Save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const MONTHS = [t('January'), t('February'), t('March'), t('April'), t('May'), t('June'), t('July'), t('August'), t('September'), t('October'), t('November'), t('December')];

/** One fact with its icon: label on top, value below (wraps; blank shows "Not added"). */
function InfoTile({ icon: Icon, label, value, mono }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
      <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: 1.5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(var(--brand-rgb), 0.10)', color: 'var(--brand-strong)' }}>
        <Icon sx={{ fontSize: 18 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word', color: value ? 'text.primary' : 'text.disabled', ...(mono && value && { fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }) }}>
          {value || t('Not added')}
        </Typography>
      </Box>
    </Stack>
  );
}

/** The organisation at a glance: logo and name, tax and contact details, the registered address and accounting basics. */
function OrganisationCard({ session }) {
  const canView = usePermission('organisation.view');
  const canEditOrganisation = usePermission('organisation.edit');
  const navigate = useNavigate();
  const logoUrl = useOrganisationLogo();
  const { data: full, isLoading } = useOrganisationQuery(undefined, { skip: !canView });
  const [editingName, setEditingName] = useState(false);
  const org = { ...session.organisation, ...(full ?? {}) };
  const a = full?.address ?? {};
  const stateCode = a.stateCode ?? org.stateCode;
  const street = [a.line1, a.line2, a.landmark && `Near ${a.landmark}`].filter(Boolean).join(', ');
  const place = [a.postOffice && a.postOffice !== a.city ? `${a.postOffice} PO` : null, a.city, a.district && a.district !== a.city ? a.district : null].filter(Boolean).join(', ');
  const region = [stateCode ? stateName(stateCode) : null, a.pincode].filter(Boolean).join(' – ');
  const hasAddress = Boolean(a.line1 || a.city || a.pincode);
  const fyStart = (full?.fyStartMonth ?? 4) - 1;

  return (
    <Card sx={{ overflow: 'hidden' }}>
      {/* Header: logo, name and the key registrations. */}
      <Box sx={{ px: { xs: 2.5, sm: 3 }, pt: 3, pb: 2.5, background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.14) 0%, rgba(var(--brand-rgb), 0.03) 60%, transparent 100%)', borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 64, height: 64, flexShrink: 0, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: 'background.paper', border: 1, borderColor: 'divider', boxShadow: '0 6px 18px rgba(23, 23, 23, 0.08)', overflow: 'hidden' }}>
            {logoUrl ? <Box component="img" src={logoUrl} alt="" sx={{ maxWidth: '82%', maxHeight: '82%', objectFit: 'contain' }} /> : <DiamondMark size={30} />}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--brand-strong)' }}>{t('Organisation')}</Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Typography variant="h4" noWrap sx={{ fontWeight: 700 }}>
                {org.name}
              </Typography>
              {canEditOrganisation && (
                <Tooltip title={t('Edit business name')}>
                  <IconButton size="small" onClick={() => setEditingName(true)} aria-label={t('Edit business name')} sx={{ width: 34, height: 34 }}>
                    <EditOutlinedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
            <Typography variant="body2" color="textSecondary" noWrap>
              {org.legalName && org.legalName !== org.name ? org.legalName : t('As shown on invoices and reports')}
            </Typography>
          </Box>
        </Stack>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 2 }}>
          <Chip size="small" label={org.gstin ? t('GSTIN {{gstin}}', { gstin: org.gstin }) : t('GSTIN not added')} color={org.gstin ? 'primary' : 'default'} variant={org.gstin ? 'filled' : 'outlined'} sx={{ fontWeight: 600 }} />
          {stateCode && <Chip size="small" variant="outlined" label={stateName(stateCode)} />}
          {full?.createdAt && <Chip size="small" variant="outlined" label={t('Since {{createdAt}}', { createdAt: formatDate(full.createdAt) })} />}
        </Stack>
        {canEditOrganisation && <BusinessNameDialog open={editingName} onClose={() => setEditingName(false)} />}
      </Box>

      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        {canView && isLoading ? (
          <LoadingState />
        ) : (
          <Stack spacing={2.5}>
            {full && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.25 }}>
                <InfoTile icon={PhoneOutlinedIcon} label={t('Phone')} value={full.phone} mono />
                <InfoTile icon={MailOutlineRoundedIcon} label={t('Email')} value={full.email} />
                <InfoTile icon={ReceiptLongOutlinedIcon} label={t('GSTIN')} value={full.gstin} mono />
                <InfoTile icon={BadgeOutlinedIcon} label={t('PAN')} value={full.pan} mono />
              </Box>
            )}

            {/* Registered address — the same one as the head office branch and the Super Admin's record. */}
            {full && (
              <Box sx={{ p: 2, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--brand-light), var(--brand) 60%, var(--brand-deep))', color: '#fff' }}>
                    <LocationOnOutlinedIcon sx={{ fontSize: 18 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{t('Registered address')}</Typography>
                    {hasAddress ? (
                      <>
                        {street && (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {street}
                          </Typography>
                        )}
                        {place && <Typography variant="body2">{place}</Typography>}
                        {region && (
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {region}
                          </Typography>
                        )}
                      </>
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        {region ? `${region} · ` : ''}{t('Full address not added yet.')}
                      </Typography>
                    )}
                  </Box>
                  {canEditOrganisation && (
                    <Button size="small" onClick={() => navigate('/settings/organisation')} sx={{ flexShrink: 0 }}>
                      {hasAddress ? t('Change') : t('Add address')}
                    </Button>
                  )}
                </Stack>
              </Box>
            )}

            {/* Accounting basics. */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
              {[
                [t('Currency'), org.currency ?? 'INR'],
                [t('Financial year'), `${MONTHS[fyStart].slice(0, 3)} – ${MONTHS[(fyStart + 11) % 12].slice(0, 3)}`],
                [t('Timezone'), (org.timezone ?? '').replace('Asia/', '') || '—'],
              ].map(([label, value], n) => (
                <Box key={label} sx={{ px: 1.5, py: 1.25, textAlign: 'center', borderLeft: n ? 1 : 0, borderColor: 'divider' }}>
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                    {label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>

            {canEditOrganisation && (
              <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => navigate('/settings/organisation')} sx={{ alignSelf: 'flex-start' }}>
                {t('Edit organisation details')}
              </Button>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const canEditOrganisation = usePermission('organisation.edit');
  // The Organisation tab is the organisation's own details: not for people who work in particular branches.
  const showOrganisation = Boolean(session.user.allBranches);
  const [chosenTab, setTab] = useTabParam('account');
  const tab = chosenTab === 'organisation' && !showOrganisation ? 'account' : chosenTab;

  return (
    <>
      <PageHeader title={t('Profile & security')} subtitle={t('Manage your personal details, password and signed-in devices.')} />
      <Stack spacing={{ xs: 2, sm: 3 }}>
        <ProfileHero session={session} />
        {session.user.mustChangePassword && <Alert severity="warning">{t('Your administrator has asked you to change your password. Please set a new one below.')}</Alert>}
        <ProfileStats session={session} />

        {/* The rest in three tabs, so the page stays short (the open one is kept in the address). */}
        <Box>
          <ViewTabs
            value={tab}
            onChange={setTab}
            sx={{ mb: { xs: 2, sm: 2.5 }, maxWidth: { sm: 520 } }}
            items={[{ value: 'account', label: t('Account') }, showOrganisation && { value: 'organisation', label: t('Organisation') }, { value: 'devices', label: t('Devices') }]}
          />

          {tab === 'account' && (
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Section title={t('Personal details')}>
                  <ProfileForm user={session.user} />
                </Section>
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <Section title={t('Password')} description={t('Changing your password signs you out on other devices.')}>
                  <ChangePasswordForm />
                </Section>
              </Grid>
            </Grid>
          )}

          {tab === 'devices' && (
            <Box sx={{ maxWidth: 820 }}>
              <Section title={t('Signed-in devices')} description={t('Sign out of any device you do not recognise.')}>
                <SessionsList />
              </Section>
            </Box>
          )}

          {tab === 'organisation' && (
            <Grid container spacing={{ xs: 2, sm: 3 }}>
              <Grid size={{ xs: 12, lg: 7 }}>
                <OrganisationCard session={session} />
              </Grid>
              <Grid size={{ xs: 12, lg: 5 }}>
                <LogoCard
                  canEdit={canEditOrganisation}
                  title={t('Organisation logo')}
                  caption={canEditOrganisation ? t('Shown at the top of the sidebar and printed on invoices. PNG, JPEG or WebP up to 1 MB; a square logo looks best.') : t('Shown at the top of the sidebar and printed on invoices. Ask an administrator to change it.')}
                />
              </Grid>
            </Grid>
          )}
        </Box>
      </Stack>
    </>
  );
}
