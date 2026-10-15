import { zodResolver } from '@hookform/resolvers/zod';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import LockResetRoundedIcon from '@mui/icons-material/LockResetRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { Alert, Box, Button, Chip, InputAdornment, Link, Stack, Typography } from '@mui/material';
import { forgotPasswordSchema, passwordSchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useDispatch } from 'react-redux';
import { Link as RouterLink } from 'react-router';
import { z } from 'zod';
import OtpInput from '../../components/form/OtpInput.jsx';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { branchSelected, signedIn } from '../../store/authSlice.js';
import { applyServerErrors, getErrorCode, getErrorMessage } from '../../utils/errors.js';
import { platformSignedIn } from '../platform/platformSlice.js';
import { useForgotPasswordMutation, useLoginMutation, useResetPasswordMutation, useVerifyResetCodeMutation } from './authApi.js';
import AuthCard from './AuthCard.jsx';

const RESEND_SECONDS = 60;
const CODE_MINUTES = 5;
const STEPS = ['Your email', 'Enter code', 'New password'];
const CODE_ERRORS = ['RESET_EXPIRED', 'RESET_LOCKED', 'RESET_INVALID'];

const newPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

/** Progress bar with the step names under it. */
function Progress({ step }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`, gap: 1, mb: 3 }}>
      {STEPS.map((label, i) => (
        <Box key={label}>
          <Box sx={{ height: 4, borderRadius: 2, bgcolor: i <= step ? 'primary.main' : 'action.hover', transition: 'background-color 300ms ease' }} />
          <Typography sx={{ mt: 0.75, fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: i === step ? 'text.primary' : 'text.secondary' }}>
            {i + 1}. {label}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function Note({ icon: Icon, children }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', p: 1.5, borderRadius: 2, bgcolor: 'rgba(var(--brand-rgb), 0.07)', border: '1px solid rgba(var(--brand-rgb), 0.18)' }}>
      <Icon sx={{ fontSize: 18, color: 'var(--brand-strong)', mt: 0.125, flexShrink: 0 }} />
      <Typography variant="body2" color="textSecondary" sx={{ lineHeight: 1.55 }}>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * Forgot password: enter the email, then the 6-digit code emailed to it, then a new password. Nothing is signed in
 * until the new password is saved; then it signs in with it (organisation users to their dashboard, the Super Admin
 * to the admin panel).
 */
export default function ForgotPasswordPage() {
  const dispatch = useDispatch();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [forgotPassword, forgotState] = useForgotPasswordMutation();
  const [verifyResetCode, verifyState] = useVerifyResetCodeMutation();
  const [resetPassword, resetState] = useResetPasswordMutation();
  const [login, loginState] = useLoginMutation();

  const emailForm = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const passwordForm = useForm({ resolver: zodResolver(newPasswordSchema), defaultValues: { password: '', confirmPassword: '' } });

  useEffect(() => {
    if (!cooldown) return undefined;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async (address) => {
    await forgotPassword({ email: address }).unwrap();
    setCooldown(RESEND_SECONDS);
  };

  const onEmail = emailForm.handleSubmit(async ({ email: address }) => {
    try {
      await sendCode(address);
      setEmail(address);
      setOtp('');
      setCodeError(null);
      setStep(1);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  });

  const onVerify = async (code = otp) => {
    if (code.length !== 6) return setCodeError('Enter all 6 digits');
    setCodeError(null);
    try {
      // Only checks the code; it stays valid for the new-password step.
      await verifyResetCode({ email, otp: code }).unwrap();
      setOtp(code);
      passwordForm.reset();
      setStep(2);
    } catch (err) {
      setCodeError(getErrorMessage(err));
      setOtp('');
    }
    return undefined;
  };

  const onNewPassword = passwordForm.handleSubmit(async ({ password }) => {
    try {
      await resetPassword({ email, otp, password }).unwrap();
    } catch (err) {
      if (CODE_ERRORS.includes(getErrorCode(err))) {
        // The code expired meanwhile: back to the code step for a new one.
        setOtp('');
        setCodeError(getErrorMessage(err));
        setStep(1);
      } else if (!applyServerErrors(err, passwordForm.setError)) {
        toast.error(getErrorMessage(err));
      }
      return;
    }
    try {
      const { accessToken, realm } = await login({ email, password, rememberMe: false }).unwrap();
      toast.success('Password updated. You are signed in.');
      // GuestOnly then opens the dashboard (or the admin panel for a Super Admin).
      if (realm === 'platform') {
        dispatch(platformSignedIn(accessToken));
      } else {
        dispatch(branchSelected(null));
        dispatch(signedIn(accessToken));
      }
    } catch (err) {
      toast.error(`Password updated, but signing in failed: ${getErrorMessage(err)}`);
    }
  });

  const resend = async () => {
    try {
      await sendCode(email);
      setOtp('');
      setCodeError(null);
      toast.success(`A new code is on its way to ${email}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const backToSignIn = (
    <Link component={RouterLink} to="/login" color="accent" underline="hover" sx={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <ArrowBackRoundedIcon sx={{ fontSize: 16 }} /> Back to sign in
    </Link>
  );

  if (step === 0) {
    return (
      <AuthCard icon={KeyRoundedIcon} title="Forgot your password?" subtitle="No problem. Enter the email you sign in with and we will send you a 6-digit code to reset your password." footer={backToSignIn}>
        <Progress step={0} />
        <Stack component="form" spacing={2.5} noValidate onSubmit={onEmail}>
          <RHFTextField
            control={emailForm.control}
            name="email"
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><MailOutlineRoundedIcon fontSize="small" /></InputAdornment> } }}
          />
          <Button type="submit" variant="contained" size="large" loading={forgotState.isLoading} fullWidth sx={{ minHeight: 48 }}>
            Send code
          </Button>
          <Note icon={ShieldOutlinedIcon}>The code works for {CODE_MINUTES} minutes and only once. After it, you choose a new password.</Note>
        </Stack>
      </AuthCard>
    );
  }

  if (step === 2) {
    return (
      <AuthCard icon={LockResetRoundedIcon} title="Set a new password" subtitle={<>Choose a new password for <strong>{email}</strong>.</>} footer={backToSignIn}>
        <Progress step={2} />
        <Stack component="form" spacing={2.5} noValidate onSubmit={onNewPassword}>
          <PasswordField control={passwordForm.control} name="password" label="New password" autoComplete="new-password" autoFocus helperText="At least 6 characters" />
          <PasswordField control={passwordForm.control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
          <Button type="submit" variant="contained" size="large" loading={resetState.isLoading || loginState.isLoading} fullWidth sx={{ minHeight: 48 }}>
            Save password &amp; sign in
          </Button>
          <Note icon={ShieldOutlinedIcon}>Saving the new password signs you out on every other device.</Note>
        </Stack>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      icon={MarkEmailReadOutlinedIcon}
      title="Check your email"
      subtitle={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <span>We sent a 6-digit code to</span>
          <Chip
            size="small"
            label={email}
            onDelete={() => setStep(0)}
            deleteIcon={<EditOutlinedIcon aria-label="Change email" />}
            sx={{ fontWeight: 600, maxWidth: '100%' }}
          />
        </Stack>
      }
      footer={backToSignIn}
    >
      <Progress step={1} />
      <Stack
        component="form"
        spacing={2.5}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onVerify();
        }}
      >
        <Box>
          <OtpInput value={otp} onChange={setOtp} error={Boolean(codeError)} disabled={verifyState.isLoading} autoFocus onComplete={(code) => onVerify(code)} />
          {codeError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {codeError}
            </Alert>
          )}
        </Box>
        <Button type="submit" variant="contained" size="large" loading={verifyState.isLoading} disabled={otp.length !== 6} fullWidth sx={{ minHeight: 48 }}>
          Verify code
        </Button>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="textSecondary">
            Didn’t get it? Check spam, or
          </Typography>
          {cooldown > 0 ? (
            <Chip size="small" label={`Resend in 0:${String(cooldown).padStart(2, '0')}`} sx={{ fontVariantNumeric: 'tabular-nums' }} />
          ) : (
            <Button size="small" onClick={resend} loading={forgotState.isLoading} sx={{ minHeight: 0, py: 0.25, fontWeight: 700 }}>
              Resend code
            </Button>
          )}
        </Stack>
        <Note icon={ShieldOutlinedIcon}>For your security the code expires in {CODE_MINUTES} minutes and stops working after 5 wrong tries.</Note>
      </Stack>
    </AuthCard>
  );
}
