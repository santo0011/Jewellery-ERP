import AlternateEmailRoundedIcon from '@mui/icons-material/AlternateEmailRounded';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, Button, Card, CardContent, Collapse, Grid, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { fonts, tokens } from '../../theme/tokens.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { useChangePlatformPasswordMutation, usePlatformProfileQuery, useUpdatePlatformProfileMutation } from './platformApi.js';
import { platformSignedIn } from './platformSlice.js';

const s = tokens.sidebar;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'SA';

/** 0–4 from length and the kinds of characters used; shown as a four-part bar. */
function strengthOf(pw = '') {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 0.5;
  if (/[^A-Za-z0-9]/.test(pw)) score += 0.5;
  return Math.max(1, Math.min(4, Math.round(score)));
}
const STRENGTH = [null, { label: 'Weak', color: '#B42318' }, { label: 'Fair', color: '#B7791F' }, { label: 'Good', color: '#2F7D6D' }, { label: 'Strong', color: '#2E6B4F' }];

function StrengthBar({ value }) {
  const score = strengthOf(value);
  const meta = STRENGTH[score];
  return (
    <Box sx={{ mt: 1 }}>
      <Stack direction="row" spacing={0.5}>
        {[1, 2, 3, 4].map((i) => (
          <Box
            key={i}
            sx={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              bgcolor: i <= score ? meta.color : 'action.hover',
              transition: 'background-color 200ms ease',
            }}
          />
        ))}
      </Stack>
      <Typography
        variant="caption"
        sx={{
          mt: 0.5,
          display: 'block',
          color: meta?.color ?? 'text.secondary',
          fontWeight: 600,
        }}
      >
        {meta ? `${meta.label} password` : 'Use 8 or more characters with upper and lower case letters, a number and a symbol.'}
      </Typography>
    </Box>
  );
}

function PasswordField({ label, error, helperText, autoComplete, registration }) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      label={label}
      type={shown ? 'text' : 'password'}
      autoComplete={autoComplete}
      error={error}
      helperText={helperText}
      {...registration}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setShown((v) => !v)} edge="end" aria-label={shown ? 'Hide password' : 'Show password'} size="small">
                {shown ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

/** A card with an icon tile, title and one line on what it is for. */
function Section({ icon: Icon, title, subtitle, children }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2.5 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: 2.5,
              display: 'grid',
              placeItems: 'center',
              color: 'var(--brand-strong)',
              background: 'linear-gradient(145deg, rgba(var(--brand-rgb), 0.16), rgba(var(--brand-rgb), 0.04))',
              border: '1px solid rgba(var(--brand-rgb), 0.28)',
            }}
          >
            <Icon sx={{ fontSize: 21 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5">{title}</Typography>
            <Typography variant="caption" color="textSecondary">
              {subtitle}
            </Typography>
          </Box>
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', py: 1.25 }}>
      <Box sx={{ width: 32, height: 32, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', color: 'var(--brand-strong)', bgcolor: 'rgba(var(--brand-rgb), 0.10)' }}>
        <Icon sx={{ fontSize: 17 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
        <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.primary' }}>
          {value}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Light identity card with a gold band on top: initials in a gold ring, name, email, role, and when the account was last used. */
function IdentityCard({ profile }) {
  return (
    <Card sx={{ position: 'relative', overflow: 'hidden' }}>
      {/* Soft gold band behind the avatar. */}
      <Box aria-hidden sx={{ position: 'absolute', inset: '0 0 auto 0', height: 96, background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.22) 0%, rgba(var(--brand-rgb), 0.06) 100%)', borderBottom: '1px solid rgba(var(--brand-rgb), 0.18)' }} />
      <ShieldOutlinedIcon aria-hidden sx={{ position: 'absolute', right: -22, top: -14, fontSize: 130, color: 'rgba(var(--brand-rgb), 0.10)', transform: 'rotate(-10deg)', pointerEvents: 'none' }} />
      <CardContent sx={{ position: 'relative', p: { xs: 2.5, sm: 3 } }}>
        <Stack sx={{ alignItems: 'center', textAlign: 'center', pt: 2 }}>
          <Box sx={{ p: '3px', borderRadius: '50%', background: s.goldGradient, boxShadow: '0 10px 24px -10px rgba(var(--brand-rgb), 0.8)' }}>
            <Box sx={{ width: { xs: 76, sm: 88 }, height: { xs: 76, sm: 88 }, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'background.paper', border: '3px solid', borderColor: 'background.paper', color: 'var(--brand-strong)', fontFamily: fonts.display, fontWeight: 700, fontSize: { xs: 28, sm: 32 } }}>
              {initialsOf(profile.name)}
            </Box>
          </Box>
          <Typography sx={{ mt: 1.75, fontFamily: fonts.display, fontWeight: 600, fontSize: { xs: 24, sm: 28 }, lineHeight: 1.15 }}>{profile.name}</Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.25, wordBreak: 'break-all' }}>
            {profile.email}
          </Typography>
          <Box component="span" sx={{ mt: 1.25, display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1.25, py: 0.375, borderRadius: 999, fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-contrast)', background: s.goldGradient }}>
            <ShieldOutlinedIcon sx={{ fontSize: 14 }} /> Super Admin
          </Box>
        </Stack>
        <Box sx={{ mt: 2.5, pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <InfoRow icon={LoginRoundedIcon} label="Last sign-in" value={profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : 'This session'} />
          <InfoRow icon={KeyRoundedIcon} label="Password changed" value={profile.passwordChangedAt ? formatDateTime(profile.passwordChangedAt) : 'Not changed yet'} />
          <InfoRow icon={EventAvailableOutlinedIcon} label="Account created" value={formatDate(profile.createdAt)} />
        </Box>
      </CardContent>
    </Card>
  );
}

function DetailsForm({ profile }) {
  const [save, { isLoading }] = useUpdatePlatformProfileMutation();
  const { register, handleSubmit, watch, reset, setError, formState } = useForm({
    defaultValues: {
      name: profile.name,
      email: profile.email,
      currentPassword: '',
    },
  });
  useEffect(() => reset({ name: profile.name, email: profile.email, currentPassword: '' }), [profile.name, profile.email, reset]);
  const email = watch('email');
  const emailChanged = (email ?? '').trim().toLowerCase() !== profile.email;
  const needsPassword = emailChanged && !profile.signedInWithCode;
  const e = formState.errors;

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        ...(needsPassword && { currentPassword: values.currentPassword }),
      }).unwrap();
      toast.success(emailChanged ? 'Saved. Sign in with your new email from now on.' : 'Profile saved');
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Section icon={PersonOutlineRoundedIcon} title="Account details" subtitle="Your name and the email you sign in with.">
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Full name"
              autoComplete="name"
              error={Boolean(e.name)}
              helperText={e.name?.message}
              {...register('name', {
                required: 'Enter your name',
                minLength: { value: 2, message: 'Enter your name' },
              })}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              label="Email (sign-in)"
              type="email"
              autoComplete="email"
              error={Boolean(e.email)}
              helperText={e.email?.message ?? (emailChanged ? 'You will sign in with this email.' : undefined)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <AlternateEmailRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              {...register('email', {
                required: 'Enter your email',
                pattern: { value: EMAIL, message: 'Enter a valid email' },
              })}
            />
          </Grid>
        </Grid>
        <Collapse in={needsPassword} unmountOnExit>
          <Box sx={{ pt: 2 }}>
            <Alert severity="info" icon={<KeyRoundedIcon fontSize="small" />} sx={{ mb: 2 }}>
              To change your sign-in email, confirm it is you with your current password.
            </Alert>
            <Box sx={{ maxWidth: { md: 'calc(50% - 8px)' } }}>
              <PasswordField
                label="Current password"
                autoComplete="current-password"
                error={Boolean(e.currentPassword)}
                helperText={e.currentPassword?.message}
                registration={register('currentPassword', {
                  validate: (v) => !needsPassword || Boolean(v) || 'Enter your current password',
                })}
              />
            </Box>
          </Box>
        </Collapse>
        <Stack direction="row" sx={{ mt: 2.5, justifyContent: 'flex-end', gap: 1 }}>
          <Button
            color="secondary"
            onClick={() =>
              reset({
                name: profile.name,
                email: profile.email,
                currentPassword: '',
              })
            }
            disabled={!formState.isDirty || isLoading}
          >
            Discard
          </Button>
          <Button type="submit" variant="contained" loading={isLoading} disabled={!formState.isDirty}>
            Save changes
          </Button>
        </Stack>
      </Box>
    </Section>
  );
}

function PasswordForm({ profile }) {
  const dispatch = useDispatch();
  const [change, { isLoading }] = useChangePlatformPasswordMutation();
  const viaCode = profile.signedInWithCode;
  const { register, handleSubmit, watch, reset, setError, formState } = useForm({ defaultValues: { currentPassword: '', newPassword: '', confirm: '' } });
  const e = formState.errors;
  const next = watch('newPassword');

  const onSubmit = handleSubmit(async (values) => {
    try {
      const res = await change({
        ...(!viaCode && { currentPassword: values.currentPassword }),
        newPassword: values.newPassword,
      }).unwrap();
      dispatch(platformSignedIn(res.accessToken)); // this device stays signed in
      reset();
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <Section icon={LockResetRoundedIcon} title="Change password" subtitle="Every other device is signed out; this one stays signed in.">
      {viaCode && (
        <Alert severity="success" sx={{ mb: 2 }}>
          You signed in with a code from your email, so your current password is not needed. Set a new one now.
        </Alert>
      )}
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Grid container spacing={2}>
          {!viaCode && (
            <Grid size={{ xs: 12, md: 6 }}>
              <PasswordField
                label="Current password"
                autoComplete="current-password"
                error={Boolean(e.currentPassword)}
                helperText={e.currentPassword?.message}
                registration={register('currentPassword', {
                  required: 'Enter your current password',
                })}
              />
            </Grid>
          )}
          {!viaCode && <Grid size={{ xs: 0, md: 6 }} sx={{ display: { xs: 'none', md: 'block' } }} />}
          <Grid size={{ xs: 12, md: 6 }}>
            <PasswordField
              label="New password"
              autoComplete="new-password"
              error={Boolean(e.newPassword)}
              helperText={e.newPassword?.message}
              registration={register('newPassword', {
                required: 'Enter a new password',
                minLength: { value: 6, message: 'At least 6 characters' },
              })}
            />
            <StrengthBar value={next} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <PasswordField
              label="Confirm new password"
              autoComplete="new-password"
              error={Boolean(e.confirm)}
              helperText={e.confirm?.message}
              registration={register('confirm', {
                validate: (v) => v === next || 'Passwords do not match',
              })}
            />
          </Grid>
        </Grid>
        <Stack direction="row" sx={{ mt: 2.5, justifyContent: 'flex-end' }}>
          <Button type="submit" variant="contained" loading={isLoading} startIcon={<KeyRoundedIcon />}>
            Update password
          </Button>
        </Stack>
      </Box>
    </Section>
  );
}

/** The Super Admin's own account: who they are, their sign-in email and password. */
export default function AdminProfilePage() {
  const { data: profile, isLoading, error, refetch } = usePlatformProfileQuery();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  return (
    <>
      <PageHeader title="My profile" subtitle="Your Super Admin account — name, sign-in email and password." />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Box sx={{ position: { lg: 'sticky' }, top: { lg: 96 } }}>
            <IdentityCard profile={profile} />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2.5}>
            <DetailsForm profile={profile} />
            <PasswordForm profile={profile} />
          </Stack>
        </Grid>
      </Grid>
    </>
  );
}
