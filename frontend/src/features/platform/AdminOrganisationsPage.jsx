import { zodResolver } from '@hookform/resolvers/zod';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Alert, Box, Button, Card, CardContent, Grid, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { INDIAN_STATES, PLAN_KEYS, PLAN_LIMITS } from '@jerp/shared';
import { branchLimitSchema, platformCreateOrganisationSchema, platformUpdateOrganisationSchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';
import { useCreateOrganisationMutation, useOrganisationsQuery, usePlatformDashboardQuery, useSetOrganisationStatusMutation, useUpdateOrganisationMutation } from './platformApi.js';

/** Organisations are 'suspended' in the data; the panel calls that Deactivated. */
export const OrgStatusChip = ({ status }) => <StatusChip status={status} label={status === 'suspended' ? 'Deactivated' : undefined} />;

export function BranchUsage({ used, limit }) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {used} / {limit}
        <Typography component="span" variant="caption" color="textSecondary">
          {' '}
          · {Math.max(0, limit - used)} free
        </Typography>
      </Typography>
      <LinearProgress variant="determinate" value={Math.min(100, (used / limit) * 100)} color={used >= limit ? 'warning' : 'primary'} sx={{ height: 4, borderRadius: 2, mt: 0.5 }} />
    </Box>
  );
}

// The input holds text; check it is a whole number, then apply the same 1–500 rule as the API.
const formSchema = platformCreateOrganisationSchema.extend({
  branchLimit: z.string().trim().min(1, 'Branch limit is required').regex(/^\d+$/, 'Enter a whole number, e.g. 5').transform(Number).pipe(branchLimitSchema.shape.branchLimit),
});
const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }));
const EMPTY = { organisationName: '', ownerName: '', email: '', mobile: '', stateCode: '', password: '', branchLimit: '' };

function CreateOrganisationDrawer({ open, onClose }) {
  const navigate = useNavigate();
  const [create, { isLoading, error, reset: resetMutation }] = useCreateOrganisationMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) {
      reset(EMPTY);
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts, and re-running then would
    // clear the form and the error the server is about to return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const org = await create(values).unwrap();
      toast.success(`${org.name} created. It can now sign in with ${org.owner?.email ?? values.email}.`);
      onClose();
      navigate(`/admin/organisations/${org.id}`);
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <FormDrawer open={open} title="New organisation" subtitle="Creates the business, its head office branch, standard roles and its login." onClose={onClose} onSubmit={onSubmit} submitting={isLoading} submitLabel="Create organisation">
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="organisationName" label="Business name" placeholder="e.g. ABC Jewellery" autoFocus />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFSelect control={control} name="stateCode" label="State (GST)" options={STATE_OPTIONS} placeholder="Select state" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="branchLimit" label="Branch limit" placeholder="e.g. 5" helperText="Maximum branches, including the head office" required slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
        </Grid>
        <Grid size={12}>
          <Typography variant="overline" color="textSecondary">
            Organisation login
          </Typography>
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name="ownerName" label="Owner name" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="email" label="Login email" type="email" autoComplete="off" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label="Owner mobile" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={12}>
          <PasswordField control={control} name="password" label="Password" autoComplete="new-password" helperText="The organisation signs in with this email and password" />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}

const editSchema = platformUpdateOrganisationSchema.extend({ branchLimit: formSchema.shape.branchLimit });

const PLAN_LABELS = { trial: 'Trial', basic: 'Basic', professional: 'Professional', enterprise: 'Enterprise' };
const usersLabel = (max) => (max == null ? 'unlimited users' : `up to ${max} users`);
const PLAN_OPTIONS = Object.values(PLAN_KEYS).map((key) => ({ value: key, label: `${PLAN_LABELS[key]} · ${usersLabel(PLAN_LIMITS[key].users)}` }));

const editValues = (org) => ({
  organisationName: org?.name ?? '',
  email: org?.owner?.email ?? org?.email ?? '',
  mobile: org?.phone ?? org?.owner?.mobile ?? '',
  stateCode: org?.stateCode ?? '',
  branchLimit: org ? String(org.branchLimit) : '',
  plan: org?.plan ?? PLAN_KEYS.TRIAL,
  password: '',
});

export function EditOrganisationDrawer({ organisation, onClose }) {
  const [update, { isLoading, error, reset: resetMutation }] = useUpdateOrganisationMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(editSchema), defaultValues: editValues(organisation) });

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
      toast.success(`${org.name} updated`);
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <FormDrawer
      open={Boolean(organisation)}
      title="Edit organisation"
      subtitle="Changing the email changes the organisation's login email."
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={isLoading}
      submitLabel="Save changes"
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="organisationName" label="Business name" autoFocus />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFSelect control={control} name="stateCode" label="State (GST)" options={STATE_OPTIONS} placeholder="Select state" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField
            control={control}
            name="branchLimit"
            label="Branch limit"
            helperText={organisation ? `${organisation.branchesUsed} in use, including the head office` : undefined}
            required
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          />
        </Grid>
        <Grid size={12}>
          <RHFSelect control={control} name="plan" label="Plan" options={PLAN_OPTIONS} helperText={organisation ? `${organisation.activeUsers} active users, including branch logins` : undefined} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="email" label="Login email" type="email" autoComplete="off" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label="Business phone" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={12}>
          <PasswordField control={control} name="password" label="New password" autoComplete="new-password" helperText="Leave blank to keep the current password" />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}

export function AdminDashboardPage() {
  const { data, isLoading, error, refetch } = usePlatformDashboardQuery();
  const { columns, editDrawer } = useOrganisationTable();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const stats = [
    ['Organisations', data.organisations],
    ['Active', data.active],
    ['Deactivated', data.suspended],
    ['Active branches', data.branches],
    ['Active users', data.users],
  ];
  return (
    <>
      <PageHeader title="Platform overview" subtitle="All organisations on this platform." />
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {stats.map(([label, value]) => (
          <Grid key={label} size={{ xs: 6, md: 'grow' }}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="textSecondary">
                  {label}
                </Typography>
                <Typography variant="h2" component="p">
                  {value}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Typography variant="h4" sx={{ mb: 1.5 }}>
        Recently created
      </Typography>
      <DataTable columns={columns} rows={data.recent} getRowId={(o) => o.id} empty={{ title: 'No organisations yet' }} />
      {editDrawer}
    </>
  );
}

const orgColumns = [
  {
    key: 'name',
    label: 'Organisation',
    render: (o) => (
      <Box>
        <Typography variant="subtitle2">{o.name}</Typography>
        <Typography variant="caption" color="textSecondary">
          Since {formatDate(o.createdAt)}
        </Typography>
      </Box>
    ),
  },
  { key: 'owner', label: 'Owner', render: (o) => (o.owner ? `${o.owner.name} · ${o.owner.email}` : '—') },
  { key: 'branches', label: 'Branches', render: (o) => <BranchUsage used={o.branchesUsed} limit={o.branchLimit} /> },
  {
    key: 'plan',
    label: 'Plan · users',
    render: (o) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {PLAN_LABELS[o.plan] ?? '—'}
        </Typography>
        <Typography variant="caption" color={o.userLimit != null && o.activeUsers >= o.userLimit ? 'warning.main' : 'textSecondary'}>
          {o.activeUsers} / {o.userLimit ?? '∞'} users
        </Typography>
      </Box>
    ),
  },
  { key: 'status', label: 'Status', render: (o) => <OrgStatusChip status={o.status} /> },
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
      toast.success(deactivating ? `${toggling.name} deactivated` : `${toggling.name} activated`);
      setToggling(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  const view = (o) => navigate(`/admin/organisations/${o.id}`);
  const columns = [
    ...orgColumns,
    {
      key: 'actions',
      label: '',
      align: 'right',
      width: 132,
      render: (o) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title="View">
            <IconButton size="small" onClick={() => view(o)} aria-label={`View ${o.name}`}>
              <VisibilityOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit">
            <IconButton size="small" onClick={() => setEditing(o)} aria-label={`Edit ${o.name}`}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={o.status === 'active' ? 'Deactivate' : 'Activate'}>
            <IconButton size="small" color={o.status === 'active' ? 'error' : 'success'} onClick={() => setToggling(o)} aria-label={`${o.status === 'active' ? 'Deactivate' : 'Activate'} ${o.name}`}>
              <PowerSettingsNewRoundedIcon fontSize="small" />
            </IconButton>
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
        title={deactivating ? `Deactivate ${toggling?.name}?` : `Activate ${toggling?.name}?`}
        message={
          deactivating
            ? 'Everyone in this organisation is signed out at once and cannot sign in until you activate it again. At sign-in they will see that the organisation is deactivated. Their data is kept.'
            : 'Users of this organisation will be able to sign in again.'
        }
        confirmLabel={deactivating ? 'Deactivate' : 'Activate'}
        danger={deactivating}
        loading={savingStatus}
        onConfirm={confirmToggle}
        onClose={() => setToggling(null)}
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
        title="Organisations"
        subtitle="Each organisation is one jewellery business. You control how many branches it can open."
        actions={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>
            New organisation
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
        empty={list.filtered ? { title: 'No matching organisations' } : { title: 'No organisations yet', description: 'Create the first jewellery business on the platform.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search name, GSTIN, email or phone" />
            <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 180 } }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="suspended">Deactivated</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <CreateOrganisationDrawer open={open} onClose={() => setOpen(false)} />
      {editDrawer}
    </>
  );
}
