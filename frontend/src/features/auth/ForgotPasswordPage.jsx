import { zodResolver } from '@hookform/resolvers/zod';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import { Alert, Box, Button, Link, Stack, Typography } from '@mui/material';
import { forgotPasswordSchema, passwordSchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link as RouterLink, useNavigate } from 'react-router';
import { z } from 'zod';
import OtpInput from '../../components/form/OtpInput.jsx';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { useForgotPasswordMutation, useResetPasswordMutation, useVerifyResetCodeMutation } from './authApi.js';
import AuthCard from './AuthCard.jsx';

const RESEND_SECONDS = 60;
const STEPS = ['Email', 'Code', 'New password'];

const passwordForm = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

/** 1 · 2 · 3 progress dots under the title. */
function StepDots({ step }) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', mb: 3 }}>
      {STEPS.map((label, i) => (
        <Stack key={label} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 700,
              bgcolor: i <= step ? 'primary.main' : 'action.hover',
              color: i <= step ? 'primary.contrastText' : 'text.secondary',
            }}
          >
            {i + 1}
          </Box>
          <Typography variant="caption" sx={{ fontWeight: i === step ? 700 : 500, color: i === step ? 'text.primary' : 'text.secondary', display: { xs: i === step ? 'block' : 'none', sm: 'block' } }}>
            {label}
          </Typography>
          {i < STEPS.length - 1 && <Box sx={{ width: { xs: 12, sm: 20 }, height: 1, bgcolor: 'divider' }} />}
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Forgot password in three steps: the email, the 6-digit code emailed to it, then a new password.
 * Works the same for organisation users and the Super Admin.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [forgotPassword, forgotState] = useForgotPasswordMutation();
  const [verifyCode, verifyState] = useVerifyResetCodeMutation();
  const [resetPassword, resetState] = useResetPasswordMutation();

  const emailForm = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });
  const pwForm = useForm({ resolver: zodResolver(passwordForm), defaultValues: { password: '', confirmPassword: '' } });

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
      await verifyCode({ email, otp: code }).unwrap();
      setStep(2);
    } catch (err) {
      setCodeError(getErrorMessage(err));
      setOtp('');
    }
    return undefined;
  };

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

  const onReset = pwForm.handleSubmit(async ({ password }) => {
    try {
      await resetPassword({ email, otp, password }).unwrap();
      toast.success('Password changed. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      // The code ran out (or was used up) while choosing a password: start again from the code step.
      toast.error(getErrorMessage(err));
      setOtp('');
      setStep(1);
    }
  });

  const titles = [
    ['Forgot your password?', 'Enter the email you sign in with. We will email you a 6-digit code.'],
    ['Check your email', null],
    ['Choose a new password', 'You will be signed out on all devices for your security.'],
  ];

  return (
    <AuthCard
      title={titles[step][0]}
      subtitle={titles[step][1]}
      footer={
        <Link component={RouterLink} to="/login" color="accent" sx={{ fontWeight: 600 }}>
          Back to sign in
        </Link>
      }
    >
      <StepDots step={step} />

      {step === 0 && (
        <Stack component="form" spacing={2} noValidate onSubmit={onEmail}>
          <RHFTextField control={emailForm.control} name="email" label="Email" type="email" autoComplete="email" autoFocus />
          <Button type="submit" variant="contained" size="large" loading={forgotState.isLoading} fullWidth>
            Send code
          </Button>
        </Stack>
      )}

      {step === 1 && (
        <Stack
          component="form"
          spacing={2.5}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onVerify();
          }}
        >
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start', p: 1.5, borderRadius: 2, bgcolor: 'rgba(201, 162, 39, 0.08)' }}>
            <MarkEmailReadOutlinedIcon sx={{ color: 'accent.main', mt: 0.25 }} />
            <Typography variant="body2">
              If an account uses <strong>{email}</strong>, a 6-digit code is on its way. Enter it below — it works for a few minutes.{' '}
              <Link component="button" type="button" variant="body2" color="accent" onClick={() => setStep(0)} sx={{ fontWeight: 600, verticalAlign: 'baseline' }}>
                Change email
              </Link>
            </Typography>
          </Stack>
          <Box>
            <OtpInput value={otp} onChange={setOtp} error={Boolean(codeError)} disabled={verifyState.isLoading} autoFocus onComplete={(code) => onVerify(code)} />
            {codeError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {codeError}
              </Alert>
            )}
          </Box>
          <Button type="submit" variant="contained" size="large" loading={verifyState.isLoading} disabled={otp.length !== 6} fullWidth>
            Verify code
          </Button>
          <Typography variant="body2" color="textSecondary" sx={{ textAlign: 'center' }}>
            Didn’t get it? Check spam, or{' '}
            {cooldown > 0 ? (
              <span>resend in {cooldown}s</span>
            ) : (
              <Link component="button" type="button" variant="body2" color="accent" onClick={resend} disabled={forgotState.isLoading} sx={{ fontWeight: 600, verticalAlign: 'baseline' }}>
                resend the code
              </Link>
            )}
          </Typography>
        </Stack>
      )}

      {step === 2 && (
        <Stack component="form" spacing={2} noValidate onSubmit={onReset}>
          <PasswordField control={pwForm.control} name="password" label="New password" autoComplete="new-password" helperText="At least 6 characters" autoFocus />
          <PasswordField control={pwForm.control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
          <Button type="submit" variant="contained" size="large" loading={resetState.isLoading} fullWidth>
            Change password
          </Button>
        </Stack>
      )}
    </AuthCard>
  );
}
