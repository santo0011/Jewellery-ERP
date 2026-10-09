import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, Button, Card, CardContent, Divider, Grid, Stack, Typography } from '@mui/material';
import { updateOrganisationSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import AddressFields from '../../components/form/AddressFields.jsx';
import LogoCard from './LogoCard.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { daysUntil, formatDate, nullsToEmpty } from '../../utils/format.js';
import EditHistory from '../../components/EditHistory.jsx';
import { useOrganisationHistoryQuery, useOrganisationQuery, useSubscriptionQuery, useUpdateOrganisationMutation } from './organisationApi.js';

const upper = (v) => v.toUpperCase();

const toFormValues = (org) => {
  const v = nullsToEmpty(org);
  return {
    name: v.name,
    legalName: v.legalName,
    gstin: v.gstin,
    pan: v.pan,
    phone: v.phone,
    email: v.email,
    timezone: v.timezone || 'Asia/Kolkata',
    address: { line1: '', line2: '', city: '', stateCode: '', pincode: '', ...v.address },
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
  const limit = (n) => (n == null ? 'Unlimited' : n.toLocaleString('en-IN'));

  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="textSecondary">
          Plan
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
          <Typography variant="h3" sx={{ textTransform: 'capitalize' }}>
            {data.plan}
          </Typography>
          <StatusChip status={data.status} />
        </Stack>
        {trialDays !== null && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
            Trial ends {formatDate(data.trialEndsAt)} ({trialDays > 0 ? `${trialDays} days left` : 'ended'})
          </Typography>
        )}
        <Divider sx={{ my: 2 }} />
        <Stack spacing={1}>
          {[
            ['Users', data.limits.users],
            ['Branches', data.limits.branches],
            ['Products', data.limits.products],
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
  const { control, handleSubmit, reset, setError, formState } = useForm({ resolver: zodResolver(updateOrganisationSchema) });

  useEffect(() => {
    if (data) reset(toFormValues(data));
  }, [data, reset]);

  if (isLoading) return <LoadingState label="Loading organisation" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      const updated = await update(values).unwrap();
      reset(toFormValues(updated));
      toast.success('Organisation updated');
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <>
      <PageHeader
        title="Organisation"
        subtitle="Business identity used on invoices, GST returns and reports."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Organisation' }]}
      />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card component="form" noValidate onSubmit={onSubmit}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
              {!canEdit && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  You have view-only access to organisation settings.
                </Alert>
              )}
              <Typography variant="h4" sx={{ mb: 2 }}>
                Business details
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="name" label="Display name" disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="legalName" label="Legal name" helperText="As registered for GST" disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="gstin" label="GSTIN" transform={upper} slotProps={{ htmlInput: { maxLength: 15 } }} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="pan" label="PAN" transform={upper} slotProps={{ htmlInput: { maxLength: 10 } }} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="phone" label="Phone" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} disabled={!canEdit} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="email" label="Business email" type="email" disabled={!canEdit} />
                </Grid>
              </Grid>

              <Typography variant="h4" sx={{ mt: 4, mb: 2 }}>
                Registered address
              </Typography>
              <AddressFields control={control} disabled={!canEdit} />

              {canEdit && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
                  <Button color="secondary" onClick={() => reset(toFormValues(data))} disabled={!formState.isDirty || saving}>
                    Discard
                  </Button>
                  <Button type="submit" variant="contained" loading={saving} disabled={!formState.isDirty}>
                    Save changes
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={3}>
            <LogoCard hasLogo={Boolean(data.logoFileId)} canEdit={canEdit} />
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
