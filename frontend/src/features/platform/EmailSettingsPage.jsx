import { zodResolver } from '@hookform/resolvers/zod';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogContent, DialogTitle, Divider, FormControlLabel, Grid, IconButton, Stack, Switch, TextField, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { emailSettingsSchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { useEmailPreviewQuery, useEmailSettingsQuery, usePlatformMeQuery, useSaveEmailSettingsMutation, useTestEmailSettingsMutation } from './platformApi.js';

const SECURITY = [
  { value: 'starttls', label: 'STARTTLS (port 587)' },
  { value: 'ssl', label: 'SSL / TLS (port 465)' },
  { value: 'none', label: 'None (not recommended)' },
];
const DEFAULT_PORT = { starttls: 587, ssl: 465, none: 25 };

/** One click fills the server details of common providers; the login is still the user's own. */
const PRESETS = [
  { label: 'Gmail / Google Workspace', host: 'smtp.gmail.com', port: 587, security: 'starttls', hint: 'Use an App Password (Google account → Security → App passwords), not your normal password.' },
  { label: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587, security: 'starttls', hint: 'SMTP sign-in must be allowed for the mailbox in Microsoft 365 admin.' },
  { label: 'Zoho Mail', host: 'smtp.zoho.in', port: 465, security: 'ssl', hint: 'Use smtp.zoho.com for accounts outside India.' },
  { label: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, security: 'starttls', hint: 'Username is your Brevo login; the password is an SMTP key from Brevo.' },
];

const PREVIEWS = [
  { value: 'organisationWelcome', label: 'Welcome + sign-in code' },
  { value: 'loginOtp', label: 'New sign-in code' },
  { value: 'passwordReset', label: 'Password reset' },
  { value: 'smtpTest', label: 'Test email' },
];

const toForm = (s) => ({
  enabled: s.enabled,
  host: s.host,
  port: s.port,
  security: s.security,
  username: s.username,
  password: '',
  fromName: s.fromName,
  fromEmail: s.fromEmail,
  replyTo: s.replyTo,
});

function SectionTitle({ children, caption }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
        {children}
      </Typography>
      {caption && (
        <Typography variant="caption" color="textSecondary">
          {caption}
        </Typography>
      )}
    </Box>
  );
}

/** The branded emails as they will arrive, rendered from the server's templates (nothing is sent). */
function PreviewDialog({ template, onClose }) {
  const { data, isFetching } = useEmailPreviewQuery(template, { skip: !template });
  return (
    <Dialog open={Boolean(template)} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
        <MailOutlineRoundedIcon color="action" />
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 600 }}>
            {data?.subject ?? 'Preview'}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            Sample data — this is how the email looks in the inbox.
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close preview" sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, bgcolor: '#F4F1EA' }}>
        {isFetching || !data ? <LoadingState /> : <Box component="iframe" title="Email preview" srcDoc={data.html} sandbox="" sx={{ display: 'block', width: '100%', height: '72vh', border: 0 }} />}
      </DialogContent>
    </Dialog>
  );
}

export default function EmailSettingsPage() {
  const { data, isLoading, error, refetch } = useEmailSettingsQuery();
  const { data: me } = usePlatformMeQuery();
  const [save, saveState] = useSaveEmailSettingsMutation();
  const [sendTest, testState] = useTestEmailSettingsMutation();
  const [testTo, setTestTo] = useState('');
  const [preview, setPreview] = useState(null);
  const [hint, setHint] = useState(null);
  const { control, handleSubmit, reset, setError, setValue, getValues, watch, formState } = useForm({ resolver: zodResolver(emailSettingsSchema), defaultValues: toForm({ enabled: false, host: '', port: 587, security: 'starttls', username: '', fromName: '', fromEmail: '', replyTo: '' }) });

  useEffect(() => {
    if (data) reset(toForm(data));
  }, [data, reset]);
  useEffect(() => {
    if (me?.email && !testTo) setTestTo(me.email);
  }, [me, testTo]);

  // Switching security moves a default port along with it (587 ↔ 465), but leaves a custom port alone.
  const security = watch('security');
  useEffect(() => {
    const port = Number(getValues('port'));
    if (Object.values(DEFAULT_PORT).includes(port) && port !== DEFAULT_PORT[security]) setValue('port', DEFAULT_PORT[security], { shouldDirty: true });
  }, [security, getValues, setValue]);

  if (isLoading) return <LoadingState label="Loading email settings" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save(values).unwrap();
      reset(toForm(saved));
      toast.success(saved.delivery === 'smtp' ? 'Saved — emails now go out through your mail server' : 'Saved');
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  const runTest = async () => {
    const v = getValues();
    try {
      await sendTest({ ...v, port: Number(v.port), to: testTo }).unwrap();
      toast.success(`Test email sent to ${testTo}. Check the inbox (and spam).`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const applyPreset = (p) => {
    setValue('host', p.host, { shouldDirty: true });
    setValue('security', p.security, { shouldDirty: true });
    setValue('port', p.port, { shouldDirty: true });
    setHint(p.hint);
  };

  const live = data.delivery === 'smtp';
  const last = data.lastTest;

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      <PageHeader title="Email settings" subtitle="The mail server that sends sign-in codes, password reset links and other emails." breadcrumbs={[{ label: 'Settings' }, { label: 'Email' }]} />

      <Alert severity={live ? 'success' : 'warning'} sx={{ mb: 2.5 }}>
        {live ? (
          <>
            Emails are being sent through <strong>{data.host}</strong> as <strong>{data.fromName ? `${data.fromName} <${data.fromEmail}>` : data.fromEmail}</strong>.
          </>
        ) : (
          <>Email is off: messages are only written to the server log, and new organisations’ sign-in codes are shown to you instead. Set up your mail server below and switch it on.</>
        )}
      </Alert>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 1, mb: 2 }}>
                <Box>
                  <Typography variant="h4">SMTP server</Typography>
                  <Typography variant="body2" color="textSecondary">
                    From your email provider’s “SMTP” or “mail client” settings.
                  </Typography>
                </Box>
                <Controller
                  name="enabled"
                  control={control}
                  render={({ field }) => <FormControlLabel control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />} label={field.value ? 'Sending on' : 'Sending off'} />}
                />
              </Stack>

              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
                Quick setup
              </Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, mb: hint ? 1.5 : 2.5 }}>
                {PRESETS.map((p) => (
                  <Chip key={p.label} label={p.label} variant="outlined" onClick={() => applyPreset(p)} />
                ))}
              </Stack>
              {hint && (
                <Alert severity="info" variant="outlined" sx={{ mb: 2.5 }} onClose={() => setHint(null)}>
                  {hint}
                </Alert>
              )}

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="host" label="SMTP server" placeholder="smtp.yourdomain.com" />
                </Grid>
                <Grid size={{ xs: 6, sm: 2 }}>
                  <RHFTextField control={control} name="port" label="Port" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 5 } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <RHFSelect control={control} name="security" label="Security" options={SECURITY} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="username" label="Username" placeholder="Usually the full email address" autoComplete="off" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <PasswordField
                    control={control}
                    name="password"
                    label="Password"
                    autoComplete="new-password"
                    placeholder={data.hasPassword ? '•••••••• (saved)' : ''}
                    helperText={data.hasPassword ? 'Saved and encrypted. Leave blank to keep it.' : 'Stored encrypted; never shown again.'}
                  />
                </Grid>
              </Grid>

              <Divider sx={{ my: 3 }} />
              <SectionTitle caption="What people see in their inbox.">Sender</SectionTitle>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="fromName" label="From name" placeholder="Jewellery ERP" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="fromEmail" label="From email" placeholder="noreply@yourdomain.com" type="email" />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="replyTo" label="Reply-to (optional)" placeholder="support@yourdomain.com" type="email" />
                </Grid>
              </Grid>

              <Stack direction="row" sx={{ justifyContent: 'flex-end', gap: 1, mt: 3 }}>
                <Button color="secondary" onClick={() => reset(toForm(data))} disabled={!formState.isDirty || saveState.isLoading}>
                  Discard
                </Button>
                <Button type="submit" variant="contained" loading={saveState.isLoading} disabled={!formState.isDirty}>
                  Save settings
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            <Card>
              <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                <SectionTitle caption="Uses the values in the form, saved or not.">Send a test email</SectionTitle>
                <TextField label="Send to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} size="small" sx={{ mb: 1.5 }} />
                <Button fullWidth variant="outlined" startIcon={<SendRoundedIcon />} onClick={runTest} loading={testState.isLoading} disabled={!testTo || !watch('host') || !watch('fromEmail')}>
                  Send test
                </Button>
                {last && (
                  <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'flex-start' }}>
                    {last.ok ? <CheckCircleRoundedIcon color="success" fontSize="small" /> : <ErrorOutlineRoundedIcon color="error" fontSize="small" />}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {last.ok ? `Delivered to ${last.to}` : `Failed for ${last.to}`}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                        {formatDateTime(last.at)}
                      </Typography>
                      {!last.ok && last.error && (
                        <Typography variant="caption" color="error" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                          {last.error}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
                <SectionTitle caption="How each email looks — nothing is sent.">Email designs</SectionTitle>
                <Stack spacing={1}>
                  {PREVIEWS.map((p) => (
                    <Button key={p.value} color="secondary" variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => setPreview(p.value)} sx={{ justifyContent: 'flex-start' }}>
                      {p.label}
                    </Button>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
      <PreviewDialog template={preview} onClose={() => setPreview(null)} />
    </Box>
  );
}
