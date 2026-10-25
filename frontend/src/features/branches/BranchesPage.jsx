import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Alert, Box, Button, Chip, IconButton, InputAdornment, LinearProgress, Link, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { stateName } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { DeleteAction } from '../../components/RowActions.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useBranchesQuery, useBranchUsageQuery, useSetBranchStatusMutation } from './branchApi.js';
import BranchFormDrawer from './BranchFormDrawer.jsx';
import BranchLoginDrawer from './BranchLoginDrawer.jsx';
import { useDeleteStatus } from '../../services/recordApi.js';
import { t } from '../../i18n/index.js';

const smallChip = { height: 20, fontSize: '0.6875rem' };

export default function BranchesPage() {
  const { data: session } = useSession();
  const canCreate = usePermission('branch.create') && session.user.allBranches;
  const canEdit = usePermission('branch.edit');
  const canToggle = usePermission('branch.delete');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [drawer, setDrawer] = useState({ open: false, branch: null });
  const [confirm, setConfirm] = useState(null);
  const canManageAccess = canEdit && session.user.allBranches;
  const canEditUsers = usePermission('user.edit');
  const canManageLogin = canManageAccess && canEditUsers;
  const [loginFor, setLoginFor] = useState(null);
  const { data: usage } = useBranchUsageQuery();
  const full = usage ? usage.available === 0 : false;
  const q = useDebounce(search.trim());

  // The head office is the organisation itself (Settings → Organisation), not listed with the branches.
  const params = { page, limit, headOffice: 'exclude', ...(q && { q }), ...(status && { status }) };
  const { data, isLoading, isFetching, error, refetch } = useBranchesQuery(params);
  // Which rows can be deleted (Delete stays visible; it is disabled with the reason when not).
  const deleteStatus = useDeleteStatus('branch', data?.items);
  const [setBranchStatus, { isLoading: toggling }] = useSetBranchStatusMutation();

  const toggle = async () => {
    try {
      const next = confirm.status === 'active' ? 'inactive' : 'active';
      await setBranchStatus({ id: confirm._id, status: next }).unwrap();
      toast.success(next === 'active' ? t('Branch activated') : t('Branch deactivated'));
      setConfirm(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns = [
    {
      key: 'name',
      label: t('Branch'),
      render: (b) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box>
            <Typography variant="subtitle2">{b.name}</Typography>
            <Typography variant="body2" color="textSecondary">
              {b.code}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'location', label: t('Location'), render: (b) => [b.address?.city, stateName(b.address?.stateCode)].filter(Boolean).join(', ') || '—' },
    { key: 'gstin', label: t('GSTIN'), render: (b) => b.gstin ?? '—' },
    // The branch's own sign-in: its email and a password — set and changed here only.
    {
      key: 'login',
      label: t('Branch login'),
      render: (b) => (
        <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
          {b.email ? (
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {b.email}
            </Typography>
          ) : (
            <Typography variant="body2" color="textSecondary">
              {t('No email')}
            </Typography>
          )}
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Chip size="small" label={b.login ? b.login.role?.name ?? t('Active') : t('Not set up')} color={b.login ? 'success' : 'default'} variant="outlined" sx={smallChip} />
            {canManageLogin && (
              <Link component="button" type="button" variant="caption" onClick={() => setLoginFor(b)} sx={{ fontWeight: 600 }}>
                {b.login ? t('Manage') : t('Set up')}
              </Link>
            )}
          </Stack>
        </Stack>
      ),
    },
    { key: 'status', label: t('Status'), render: (b) => <StatusChip status={b.status} /> },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 132,
      render: (b) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          {canEdit && (
            <Tooltip title={t('Edit')}>
              <IconButton size="small" onClick={() => setDrawer({ open: true, branch: b })} aria-label={t('Edit {{name}}', { name: b.name })}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canToggle && !b.isHeadOffice && (
            <Tooltip title={b.status === 'active' ? t('Deactivate') : t('Activate')}>
              <IconButton size="small" color={b.status === 'active' ? 'error' : 'success'} onClick={() => setConfirm(b)} aria-label={b.status === 'active' ? t('Deactivate {{name}}', { name: b.name }) : t('Activate {{name}}', { name: b.name })}>
                <PowerSettingsNewRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <DeleteAction type="branch" id={b.id ?? b._id} name={b.name} status={deleteStatus(b.id ?? b._id)} />
        </Stack>
      ),
    },
  ];

  const filtered = Boolean(q || status);

  return (
    <>
      <PageHeader
        title={t('Branches')}
        subtitle={t('Showrooms and locations. Stock, cash and reports are tracked per branch.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Branches') }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawer({ open: true, branch: null })} disabled={full}>
              {t('New branch')}
            </Button>
          )
        }
      />

      {usage && usage.limit != null && (
        <Alert severity={full ? 'warning' : 'info'} icon={false} sx={{ mb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 3 }} sx={{ alignItems: { sm: 'center' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {usage.trial ? t('Free trial') : t('Your plan')}{(usage.limit === 1 ? t(': {{limit}} branch (head office included) · {{used}} in use · {{available}} available', { limit: usage.limit, used: usage.used, available: usage.available }) : t(': {{limit}} branches (head office included) · {{used}} in use · {{available}} available', { limit: usage.limit, used: usage.used, available: usage.available }))}
            </Typography>
            <LinearProgress variant="determinate" value={Math.min(100, (usage.used / usage.limit) * 100)} sx={{ flex: 1, maxWidth: 240, height: 6, borderRadius: 3 }} />
            {full && (
              <Typography variant="body2">
                {usage.trial ? t('Choose a subscription plan to add more branches.') : t('Upgrade your plan to add more branches.')}{' '}
                <Link component={RouterLink} to="/settings/subscription">
                  {t('See plans')}
                </Link>
              </Typography>
            )}
          </Stack>
        </Alert>
      )}
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={
          filtered
            ? { title: t('No matching branches'), description: t('Try a different search or status filter.') }
            : { title: t('No branches yet'), description: t('Add your first branch to start tracking stock and sales by location.') }
        }
        pagination={data && { ...data.meta, onPageChange: setPage, onLimitChange: (l) => { setLimit(l); setPage(1); } }}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              placeholder={t('Search by name, code or city')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              sx={{ maxWidth: { sm: 360 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
            />
            <TextField
              select
              slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
              label={t('Status')}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              sx={{ maxWidth: { sm: 180 } }}
            >
              <MenuItem value="">{t('All')}</MenuItem>
              <MenuItem value="active">{t('Active')}</MenuItem>
              <MenuItem value="inactive">{t('Inactive')}</MenuItem>
            </TextField>
          </Stack>
        }
      />

      <BranchLoginDrawer
        branch={loginFor}
        onClose={() => setLoginFor(null)}
        onEditBranch={(b) => {
          setLoginFor(null);
          setDrawer({ open: true, branch: b });
        }}
      />
      <BranchFormDrawer open={drawer.open} branch={drawer.branch} onClose={() => setDrawer({ open: false, branch: null })} />

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.status === 'active' ? t('Deactivate branch?') : t('Activate branch?')}
        message={
          confirm?.status === 'active'
            ? t('{{name}} will be hidden from the branch switcher and new transactions. Its history is kept.', { name: confirm?.name })
            : t('{{name}} will be available for transactions again.', { name: confirm?.name })
        }
        confirmLabel={confirm?.status === 'active' ? t('Deactivate') : t('Activate')}
        danger={confirm?.status === 'active'}
        loading={toggling}
        onConfirm={toggle}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
