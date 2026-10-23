import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import { updateOrganisationSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import PincodeAddressFields, { addressFormValues, formatAddress } from '../../components/form/PincodeAddressFields.jsx';
import LogoCard from './LogoCard.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { daysUntil, formatDate, nullsToEmpty } from '../../utils/format.js';
import EditHistory from '../../components/EditHistory.jsx';
import { useLazyPincodeQuery, useOrganisationHistoryQuery, useOrganisationQuery, useSubscriptionQuery, useUpdateOrganisationMutation } from './organisationApi.js';
import { t, tValue } from '../../i18n/index.js';

const upper = (v) => v.toUpperCase();

export const toFormValues = (org) => {
  const v = nullsToEmpty(org);
  return {
    name: v.name,
    legalName: v.legalName,
    gstin: v.gstin,
    pan: v.pan,
    phone: v.phone,
    email: v.email,
    timezone: v.timezone || 'Asia/Kolkata',
    // Same address fields as the Super Admin's create and edit forms (ADDRESS_FIELDS); the state lives in it here.
    address: { ...addressFormValues(org.address), stateCode: v.address?.stateCode ?? '' },
  };
};

function OrganisationHistory() {
  const { data, isLoading, error } = useOrganisationHistoryQuery();
  return <EditHistory entries={data} isLoading={isLoading} error={error} />;
}

function SubscriptionCard() {
  const { data, isLoading, error } = useSubscriptionQuery();
  if (isLoading) return <LoadingState />;
  if (error) return <Alert severity="error">{getErrorMessage(error)}</Alert>;
  const trialDays = data.status === 'trial' ? daysUntil(data.trialEndsAt) : null;
  const limit = (n) => (n == null ? t('Unlimited') : n.toLocaleString('en-IN'));

  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="textSecondary">
          {t('Plan')}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
          <Typography variant="h3" sx={{ textTransform: 'capitalize' }}>
            {tValue(data.plan)}
          </Typography>
          <StatusChip status={data.status} />
        </Stack>
        {trialDays !== null && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            {trialDays > 0 ? t('Trial ends {{trialEndsAt}} ({{trialDays}} days left)', { trialEndsAt: formatDate(data.trialEndsAt), trialDays }) : t('Trial ended {{trialEndsAt}}', { trialEndsAt: formatDate(data.trialEndsAt) })}
          </Typography>
        )}
        <Divider sx={{ my: 2 }} />
        <Stack spacing={1}>
          {[
            [t('Users'), data.limits.users],
            [t('Branches'), data.limits.branches],
            [t('Products'), data.limits.products],
          ].map(([label, value]) => (
            <Stack key={label} direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography variant="body2" color="textSecondary">
                {label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {limit(value)}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function OrganisationPage() {
  const canEdit = usePermission('organisation.edit');
  const canViewSubscription = usePermission('subscription.view');
  const { data, isLoading, error, refetch } = useOrganisationQuery();
  const [update, { isLoading: saving }] = useUpdateOrganisationMutation();
  const { control, handleSubmit, reset, setError, setValue, formState } = useForm({ resolver: zodResolver(updateOrganisationSchema) });
  const [findPincode] = useLazyPincodeQuery();

  useEffect(() => {
    if (data) reset(toFormValues(data));
  }, [data, reset]);

  if (isLoading) return <LoadingState label={t('Loading organisation')} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await update(values).unwrap();
      reset(toFormValues(updated));
      toast.success(t('Organisation updated'));
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <>
      <PageHeader
        title={t('Organisation')}
        subtitle={t('Business identity used on invoices, GST returns and reports.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Organisation') }]}
      />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card component="form" noValidate onSubmit={onSubmit}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
              {!canEdit && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t('You have view-only access to organisation settings.')}
                </Alert>
              )}
              <Typography variant="h4" sx={{ mb: 2 }}>
                {t('Business details')}
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="name" label={t('Display name')} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="legalName" label={t('Legal name')} helperText={t('As registered for GST')} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="gstin" label={t('GSTIN')} transform={upper} slotProps={{ htmlInput: { maxLength: 15 } }} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="pan" label={t('PAN')} transform={upper} slotProps={{ htmlInput: { maxLength: 10 } }} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="phone" label={t('Phone')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="email" label={t('Business email')} type="email" disabled={!canEdit} />
                </Grid>
              </Grid>

              <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>
                {t('Registered address')}
              </Typography>
              {canEdit ? (
                <PincodeAddressFields control={control} setValue={setValue} stateField="address.stateCode" lookup={(pin) => findPincode(pin, true).unwrap()} />
              ) : formatAddress(data.address ?? {}).length ? (
                formatAddress(data.address ?? {}).map((line) => (
                  <Typography key={line} variant="body2" sx={{ lineHeight: 1.7 }}>
                    {line}
                  </Typography>
                ))
              ) : (
                <Typography variant="body2" color="textSecondary">
                  {t('No address yet.')}
                </Typography>
              )}

              {canEdit && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
                  <Button color="secondary" onClick={() => reset(toFormValues(data))} disabled={!formState.isDirty || saving}>
                    {t('Discard')}
                  </Button>
                  <Button type="submit" variant="contained" loading={saving} disabled={!formState.isDirty}>
                    {t('Save changes')}
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={3}>
            <LogoCard canEdit={canEdit} />
            {canViewSubscription && <SubscriptionCard />}
          </Stack>
        </Grid>
        <Grid size={12}>
          <OrganisationHistory />
        </Grid>
      </Grid>
    </>
  );
}
