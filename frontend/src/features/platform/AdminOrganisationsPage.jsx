import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { zodResolver } from '@hookform/resolvers/zod';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, Button, Card, CardContent, Grid, IconButton, InputAdornment, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { TRIAL_BRANCH_LIMIT } from '@jerp/shared';
import { platformCreateOrganisationSchema, platformUpdateOrganisationSchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import LoginCodeDialog from './LoginCodeDialog.jsx';
import PincodeAddressFields, { addressFormValues } from '../../components/form/PincodeAddressFields.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';
import { useCreateOrganisationMutation, useDeleteOrganisationMutation, useLazyPincodeQuery, useOrganisationsQuery, useSetOrganisationStatusMutation, useUpdateOrganisationMutation } from './platformApi.js';
import { SubscriptionChip } from '../billing/billingUi.jsx';
import { t } from '../../i18n/index.js';

/** Organisations are 'suspended' in the data; the panel calls that Deactivated. */
export const OrgStatusChip = ({ status }) => <StatusChip status={status} label={status === 'suspended' ? t('Deactivated') : undefined} />;

/** Branches in use against the subscription's limit (2 on a free trial, else the plan's; null = unlimited). */
export function BranchUsage({ used, limit }) {
  if (limit == null) {
    return (
      <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 120 }}>
        {used}
        <Typography component="span" variant="caption" color="textSecondary">
          {' '}
          {t('· unlimited')}
        </Typography>
      </Typography>
    );
  }
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {used} / {limit}
        <Typography component="span" variant="caption" color="textSecondary">
          {' '}
          {t('· {{Math}} free', { Math: Math.max(0, limit - used) })}
        </Typography>
      </Typography>
      <LinearProgress variant="determinate" value={Math.min(100, (used / limit) * 100)} color={used >= limit ? 'warning' : 'primary'} sx={{ height: 4, borderRadius: 2, mt: 0.5 }} />
    </Box>
  );
}

// The input holds text; check it is whole days, then apply the same rule as the API.
const formSchema = platformCreateOrganisationSchema.extend({
  freeDays: z.string().trim().min(1, t('Enter the free days (0 for none)')).regex(/^\d+$/, t('Enter whole days, e.g. 14')).transform(Number).pipe(z.number().max(365, t('At most 365 days'))),
});
// No password: a 6-digit sign-in code is emailed instead (an empty password here would fail validation unseen).
const EMPTY = { organisationName: '', ownerName: '', email: '', mobile: '', stateCode: '', freeDays: '14', address: addressFormValues() };

function CreateOrganisationDrawer({ open, onClose }) {
  const [create, { isLoading, error, reset: resetMutation }] = useCreateOrganisationMutation();
  const [findPincode] = useLazyPincodeQuery();
  const { control, handleSubmit, reset, setError, setValue } = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) {
      reset(EMPTY);
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts, and re-running then would
    // clear the form and the error the server is about to return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The new organisation and how its sign-in code went out: shown in a dialog, then its page opens.
  const [created, setCreated] = useState(null);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const org = await create(values).unwrap();
      toast.success(t('{{name}} created', { name: org.name }));
      onClose();
      setCreated(org);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <>
    <LoginCodeDialog
      result={created?.loginEmail}
      title={created ? t('{{name}} is ready', { name: created.name }) : ''}
      onClose={() => {
        setCreated(null);
      }}
    />
    <FormDrawer open={open} title={t('New organisation')} subtitle={t('Creates the business, its head office branch, standard roles and its login.')} onClose={onClose} onSubmit={onSubmit} submitting={isLoading} submitLabel={t('Create organisation')} width={640}>
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="organisationName" label={t('Business name')} placeholder={t('e.g. ABC Jewellery')} autoFocus />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField
            control={control}
            name="freeDays"
            label={t('Free use')}
            placeholder={t('e.g. 14')}
            required
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 3 }, input: { endAdornment: <InputAdornment position="end">{t('days')}</InputAdornment> } }}
          />
        </Grid>
        <Grid size={12}>
          <Alert severity="info" variant="outlined">
            {t('During the free days the organisation can run {{TRIAL_BRANCH_LIMIT}} branches, head office included. After that, branches, users and products follow the subscription plan it takes.', { TRIAL_BRANCH_LIMIT })}
          </Alert>
        </Grid>
        <Grid size={12}>
          <Typography variant="overline" color="textSecondary" sx={{ display: 'block' }}>
            {t('Registered address')}
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1.5 }}>
            {t('Start with the PIN code — the post office, city, district and state fill in by themselves. Also used for the head office branch.')}
          </Typography>
          <PincodeAddressFields control={control} setValue={setValue} lookup={(pin) => findPincode(pin, true).unwrap()} />
        </Grid>
        <Grid size={12}>
          <Typography variant="overline" color="textSecondary">
            {t('Organisation login')}
          </Typography>
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name="ownerName" label={t('Owner name')} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="email" label={t('Login email')} type="email" autoComplete="off" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label={t('Owner mobile')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>

      </Grid>
    </FormDrawer>
    </>
  );
}


/** "3 products, 1 customer" — why an organisation can no longer be deleted. */
export const recordsText = (records = []) => records.map((r) => t(r.count === 1 ? `{{count}} ${r.type}` : `{{count}} ${r.type}s`, { count: r.count })).join(', ');

const editSchema = platformUpdateOrganisationSchema.extend({
  // Blank (a paid organisation, where the field is locked) leaves the free days alone.
  freeDays: z
    .string()
    .trim()
    .regex(/^\d*$/, t('Enter whole days, e.g. 14'))
    .transform((v) => (v === '' ? undefined : Number(v)))
    .pipe(z.number().max(365, t('At most 365 days')).optional()),
});

const editValues = (org) => ({
  organisationName: org?.name ?? '',
  email: org?.owner?.email ?? org?.email ?? '',
  mobile: org?.phone ?? org?.owner?.mobile ?? '',
  stateCode: org?.stateCode ?? '',
  address: addressFormValues(org?.address),
  freeDays: org?.freeDays != null ? String(org.freeDays) : '',
});

export function EditOrganisationDrawer({ organisation, onClose }) {
  const [update, { isLoading, error, reset: resetMutation }] = useUpdateOrganisationMutation();
  const [findPincode] = useLazyPincodeQuery();
  const { control, handleSubmit, reset, setError, setValue } = useForm({ resolver: zodResolver(editSchema), defaultValues: editValues(organisation) });

  useEffect(() => {
    if (organisation) {
      reset(editValues(organisation));
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts, and re-running then would
    // clear the form and the error the server is about to return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisation]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const org = await update({ id: organisation.id, ...values }).unwrap();
      toast.success(t('{{name}} updated', { name: org.name }));
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <FormDrawer
      open={Boolean(organisation)}
      title={t('Edit organisation')}
      subtitle={t('Changing the email changes the organisation\'s login email.')}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={isLoading}
      submitLabel={t('Save changes')}
      width={640}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="organisationName" label={t('Business name')} autoFocus />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField
            control={control}
            name="freeDays"
            label={t('Free use')}
            placeholder={organisation?.freeDays == null ? t('Paid plan') : t('e.g. 14')}
            disabled={organisation?.freeDays == null}
            slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 3 }, input: { endAdornment: <InputAdornment position="end">{t('days')}</InputAdornment> } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="email" label={t('Login email')} type="email" autoComplete="off" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label={t('Business phone')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={12}>
          <Typography variant="overline" color="textSecondary" sx={{ display: 'block' }}>
            {t('Registered address')}
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1.5 }}>
            {t('Change the PIN code to fill post office, city, district and state again — fields you edited yourself are kept.')}
          </Typography>
          <PincodeAddressFields control={control} setValue={setValue} lookup={(pin) => findPincode(pin, true).unwrap()} />
        </Grid>
        <Grid size={12}>
          <Typography variant="caption" color="textSecondary">
            {t('To change its password, the organisation uses “Forgot password” on the sign-in page — a 6-digit code is emailed to the login email.')}
          </Typography>
        </Grid>
      </Grid>
    </FormDrawer>
  );
}

/**
 * When the organisation's trial or paid period ends, and how close that is: green with time to spare, amber in the
 * last week, red once it has run out (or the subscription is suspended / cancelled).
 */
export function ExpiryCell({ subscription: s }) {
  if (!s?.endsAt) return <Typography variant="body2" color="textSecondary">—</Typography>;
  const tone = s.expired ? 'error.main' : s.daysLeft <= 7 ? 'warning.main' : 'success.main';
  const note = s.expired ? t('Expired') : s.daysLeft === 0 ? t('Expires today') : (s.daysLeft === 1 ? t('{{daysLeft}} day left', { daysLeft: s.daysLeft }) : t('{{daysLeft}} days left', { daysLeft: s.daysLeft }));
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
        {formatDate(s.endsAt)}
      </Typography>
      <Typography variant="caption" sx={{ color: tone, fontWeight: 600, whiteSpace: 'nowrap' }}>
        {s.status === 'trial' && !s.expired ? t('Trial · {{note}}', { note }) : note}
      </Typography>
    </Box>
  );
}

const orgColumns = [
  {
    key: 'name',
    label: t('Organisation'),
    render: (o) => (
      <Box>
        <Typography variant="subtitle2">{o.name}</Typography>
        <Typography variant="caption" color="textSecondary">
          {t('Since {{createdAt}}', { createdAt: formatDate(o.createdAt) })}
        </Typography>
      </Box>
    ),
  },
  { key: 'owner', label: t('Owner'), render: (o) => (o.owner ? `${o.owner.name} · ${o.owner.email}` : '—') },
  {
    key: 'plan',
    label: t('Plan · users'),
    render: (o) => (
      <Box>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {o.plan ?? '—'}
          </Typography>
          {o.subscription && <SubscriptionChip status={o.subscription.status} />}
        </Stack>
        <Typography variant="caption" color={o.userLimit != null && o.activeUsers >= o.userLimit ? 'warning.main' : 'textSecondary'}>
          {t('{{activeUsers}} / {{value}} users', { activeUsers: o.activeUsers, value: o.userLimit ?? '∞' })}
        </Typography>
      </Box>
    ),
  },
  { key: 'expires', label: t('Expires'), render: (o) => <ExpiryCell subscription={o.subscription} /> },
  { key: 'status', label: t('Status'), render: (o) => <OrgStatusChip status={o.status} /> },
];

/** Table columns with View / Edit buttons, plus the edit drawer they open. Rows themselves are not clickable. */
function useOrganisationTable() {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [setStatus, { isLoading: savingStatus }] = useSetOrganisationStatusMutation();
  const deactivating = toggling?.status === 'active';
  const confirmToggle = async () => {
    try {
      await setStatus({ id: toggling.id, status: deactivating ? 'suspended' : 'active' }).unwrap();
      toast.success(deactivating ? t('{{name}} deactivated', { name: toggling.name }) : t('{{name}} activated', { name: toggling.name }));
      setToggling(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  const [deleting, setDeleting] = useState(null);
  const [removeOrg, { isLoading: removing }] = useDeleteOrganisationMutation();
  const confirmDelete = async () => {
    try {
      await removeOrg(deleting.id).unwrap();
      toast.success(t('{{name}} deleted', { name: deleting.name }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    setDeleting(null);
  };
  const view = (o) => navigate(`/admin/organisations/${o.id}`);
  const columns = [
    ...orgColumns,
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 168,
      render: (o) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title={t('View')}>
            <IconButton size="small" onClick={() => view(o)} aria-label={t('View {{name}}', { name: o.name })}>
              <VisibilityOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('Edit')}>
            <IconButton size="small" onClick={() => setEditing(o)} aria-label={t('Edit {{name}}', { name: o.name })}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={o.status === 'active' ? t('Deactivate') : t('Activate')}>
            <IconButton size="small" color={o.status === 'active' ? 'error' : 'success'} onClick={() => setToggling(o)} aria-label={o.status === 'active' ? t('Deactivate {{name}}', { name: o.name }) : t('Activate {{name}}', { name: o.name })}>
              <PowerSettingsNewRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={o.canDelete ? t('Delete — nothing has been added yet') : t('Cannot delete: it has {{recordsText}}', { recordsText: recordsText(o.records) })}>
            <span>
              <IconButton size="small" color="error" disabled={!o.canDelete} onClick={() => setDeleting(o)} aria-label={t('Delete {{name}}', { name: o.name })}>
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      ),
    },
  ];
  const editDrawer = (
    <>
      <EditOrganisationDrawer organisation={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={Boolean(toggling)}
        title={deactivating ? t('Deactivate {{name}}?', { name: toggling?.name }) : t('Activate {{name}}?', { name: toggling?.name })}
        message={
          deactivating
            ? t('Everyone in this organisation is signed out at once and cannot sign in until you activate it again. At sign-in they will see that the organisation is deactivated. Their data is kept.')
            : t('Users of this organisation will be able to sign in again.')
        }
        confirmLabel={deactivating ? t('Deactivate') : t('Activate')}
        danger={deactivating}
        loading={savingStatus}
        onConfirm={confirmToggle}
        onClose={() => setToggling(null)}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title={t('Delete {{name}}?', { name: deleting?.name })}
        message={t('It has no records yet, so it will be removed completely: its login, head office, roles and settings. This cannot be undone.')}
        confirmLabel={t('Delete organisation')}
        danger
        loading={removing}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      />
    </>
  );
  return { columns, editDrawer };
}

export default function AdminOrganisationsPage() {
  const [open, setOpen] = useState(false);
  const { columns, editDrawer } = useOrganisationTable();
  const list = useListParams({ status: '' });
  const { data, isLoading, isFetching, error, refetch } = useOrganisationsQuery(list.params);

  return (
    <>
      <PageHeader
        title={t('Organisations')}
        subtitle={t('Each organisation is one jewellery business. You control how many branches it can open.')}
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>
            {t('New organisation')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(o) => o.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered ? { title: t('No matching organisations') } : { title: t('No organisations yet'), description: t('Create the first jewellery business on the platform.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search name, GSTIN, email or phone')} />
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 180 } }}>
              <MenuItem value="">{t('All')}</MenuItem>
              <MenuItem value="active">{t('Active')}</MenuItem>
              <MenuItem value="suspended">{t('Deactivated')}</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <CreateOrganisationDrawer open={open} onClose={() => setOpen(false)} />
      {editDrawer}
    </>
  );
}
