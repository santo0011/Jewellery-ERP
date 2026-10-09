import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import LockPersonOutlinedIcon from '@mui/icons-material/LockPersonOutlined';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Alert, Box, Button, Chip, IconButton, InputAdornment, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { BRANCH_PERMISSIONS } from '@jerp/shared';
import { stateName } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { getErrorMessage } from '../../utils/errors.js';
import BranchAccessDrawer from './BranchAccessDrawer.jsx';
import { useBranchesQuery, useBranchUsageQuery, useSetBranchStatusMutation } from './branchApi.js';
import BranchFormDrawer from './BranchFormDrawer.jsx';
import BranchLoginDrawer from './BranchLoginDrawer.jsx';

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
  const [accessFor, setAccessFor] = useState(null);
  const canManageAccess = canEdit && session.user.allBranches;
  const canEditUsers = usePermission('user.edit');
  const canManageLogin = canManageAccess && canEditUsers;
  const [loginFor, setLoginFor] = useState(null);
  const { data: usage } = useBranchUsageQuery();
  const full = usage ? usage.available === 0 : false;
  const q = useDebounce(search.trim());

  const params = { page, limit, ...(q && { q }), ...(status && { status }) };
  const { data, isLoading, isFetching, error, refetch } = useBranchesQuery(params);
  const [setBranchStatus, { isLoading: toggling }] = useSetBranchStatusMutation();

  const toggle = async () => {
    try {
      const next = confirm.status === 'active' ? 'inactive' : 'active';
      await setBranchStatus({ id: confirm._id, status: next }).unwrap();
      toast.success(next === 'active' ? 'Branch activated' : 'Branch deactivated');
      setConfirm(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Branch',
      render: (b) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box>
            <Typography variant="subtitle2">{b.name}</Typography>
            <Typography variant="body2" color="textSecondary">
              {b.code}
            </Typography>
          </Box>
          {b.isHeadOffice && <Chip size="small" label="Head office" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
        </Stack>
      ),
    },
    { key: 'location', label: 'Location', render: (b) => [b.address?.city, stateName(b.address?.stateCode)].filter(Boolean).join(', ') || '—' },
    { key: 'gstin', label: 'GSTIN', render: (b) => b.gstin ?? '—' },
    {
      key: 'email',
      label: 'Email',
      render: (b) =>
        b.email ? (
          <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.25 }}>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {b.email}
            </Typography>
            {b.login && (
              <Tooltip title="This email can sign in to the branch panel">
                <Chip size="small" icon={<KeyOutlinedIcon />} label="Login" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem', '& .MuiChip-icon': { fontSize: 13 } }} />
              </Tooltip>
            )}
          </Stack>
        ) : (
          <Typography variant="body2" color="textSecondary">
            —
          </Typography>
        ),
    },
    {
      key: 'access',
      label: 'Access',
      render: (b) => {
        const n = (b.allowedPermissions ?? BRANCH_PERMISSIONS).length;
        return n === BRANCH_PERMISSIONS.length ? 'Full' : `${n} of ${BRANCH_PERMISSIONS.length}`;
      },
    },
    { key: 'status', label: 'Status', render: (b) => <StatusChip status={b.status} /> },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 168,
      render: (b) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          {canEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => setDrawer({ open: true, branch: b })} aria-label={`Edit ${b.name}`}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canManageLogin && (
            <Tooltip title={b.login ? 'Change password' : 'Set up branch login'}>
              <IconButton size="small" onClick={() => setLoginFor(b)} aria-label={`Login for ${b.name}`}>
                <KeyOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canManageAccess && (
            <Tooltip title="Branch access">
              <IconButton size="small" onClick={() => setAccessFor(b)} aria-label={`Access for ${b.name}`}>
                <LockPersonOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canToggle && !b.isHeadOffice && (
            <Tooltip title={b.status === 'active' ? 'Deactivate' : 'Activate'}>
              <IconButton size="small" color={b.status === 'active' ? 'error' : 'success'} onClick={() => setConfirm(b)} aria-label={b.status === 'active' ? `Deactivate ${b.name}` : `Activate ${b.name}`}>
                <PowerSettingsNewRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  const filtered = Boolean(q || status);

  return (
    <>
      <PageHeader
        title="Branches"
        subtitle="Showrooms and locations. Stock, cash and reports are tracked per branch."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Branches' }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawer({ open: true, branch: null })} disabled={full}>
              New branch
            </Button>
          )
        }
      />

      {usage && (
        <Alert severity={full ? 'warning' : 'info'} icon={false} sx={{ mb: 2 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 3 }} sx={{ alignItems: { sm: 'center' } }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Branch limit {usage.limit} · {usage.used} in use · {usage.available} available
            </Typography>
            <LinearProgress variant="determinate" value={Math.min(100, (usage.used / usage.limit) * 100)} sx={{ flex: 1, maxWidth: 240, height: 6, borderRadius: 3 }} />
            {full && (
              <Typography variant="body2">Contact your platform administrator to add more branches.</Typography>
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
            ? { title: 'No matching branches', description: 'Try a different search or status filter.' }
            : { title: 'No branches yet', description: 'Add your first branch to start tracking stock and sales by location.' }
        }
        pagination={data && { ...data.meta, onPageChange: setPage, onLimitChange: (l) => { setLimit(l); setPage(1); } }}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              placeholder="Search by name, code or city"
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
              label="Status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              sx={{ maxWidth: { sm: 180 } }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          </Stack>
        }
      />

      <BranchAccessDrawer branch={accessFor} onClose={() => setAccessFor(null)} />
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
        title={confirm?.status === 'active' ? 'Deactivate branch?' : 'Activate branch?'}
        message={
          confirm?.status === 'active'
            ? `${confirm?.name} will be hidden from the branch switcher and new transactions. Its history is kept.`
            : `${confirm?.name} will be available for transactions again.`
        }
        confirmLabel={confirm?.status === 'active' ? 'Deactivate' : 'Activate'}
        danger={confirm?.status === 'active'}
        loading={toggling}
        onConfirm={toggle}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
