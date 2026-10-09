import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Box, Button, Chip, IconButton, InputAdornment, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { tokens, fonts } from '../../theme/tokens.js';
import { useRolesQuery } from '../roles/roleApi.js';
import ResetPasswordDialog from './ResetPasswordDialog.jsx';
import { useSetUserStatusMutation, useUsersQuery } from './userApi.js';
import UserFormDrawer from './UserFormDrawer.jsx';

const smallChip = { height: 20, fontSize: '0.6875rem' };
const goldChip = { height: 24, fontSize: '0.75rem', fontWeight: 500, color: tokens.light.goldDark, bgcolor: 'rgba(201, 162, 39, 0.10)', border: '1px solid rgba(201, 162, 39, 0.25)' };
const actionButton = { width: 32, height: 32, borderRadius: 2, border: 1, borderColor: 'divider', color: 'text.secondary', '&:hover': { color: tokens.light.goldDark, borderColor: tokens.light.gold, bgcolor: 'rgba(201, 162, 39, 0.08)' } };

const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

function Monogram({ name, owner, muted }) {
  return (
    <Box
      sx={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: '0.02em',
        opacity: muted ? 0.5 : 1,
        ...(owner
          ? { background: tokens.sidebar.goldGradient, color: '#171717', boxShadow: '0 4px 12px rgba(201, 162, 39, 0.35)' }
          : { bgcolor: 'rgba(201, 162, 39, 0.10)', color: tokens.light.goldDark, border: '1px solid rgba(201, 162, 39, 0.3)' }),
      }}
    >
      {initials(name)}
    </Box>
  );
}

function StatusDot({ active }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        height: 24,
        borderRadius: 12,
        fontSize: '0.75rem',
        fontWeight: 600,
        color: active ? 'success.main' : 'text.secondary',
        bgcolor: active ? 'rgba(46, 107, 79, 0.10)' : 'action.hover',
        '&::before': { content: '""', width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' },
      }}
    >
      {active ? 'Active' : 'Disabled'}
    </Box>
  );
}

const Muted = ({ children }) => (
  <Typography variant="body2" color="textSecondary" sx={{ fontStyle: 'italic' }}>
    {children}
  </Typography>
);

export default function UsersPage() {
  const { data: session } = useSession();
  const allBranches = session.user.allBranches;
  const canCreate = usePermission('user.create') && allBranches;
  const canEdit = usePermission('user.edit') && allBranches;
  const canToggle = usePermission('user.delete') && allBranches;
  const canViewRoles = usePermission('role.view');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [roleId, setRoleId] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [drawer, setDrawer] = useState({ open: false, user: null });
  const [confirm, setConfirm] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const q = useDebounce(search.trim());

  const { data: roles = [] } = useRolesQuery(undefined, { skip: !canCreate && !canEdit && !canViewRoles });
  const { data, isLoading, isFetching, error, refetch } = useUsersQuery({ page, limit, ...(q && { q }), ...(status && { status }), ...(roleId && { roleId }) });
  const [setUserStatus, { isLoading: toggling }] = useSetUserStatusMutation();

  const isProtected = (u) => u.isOwner || String(u.id) === String(session.user.id);
  const resetPage = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
  };

  const toggle = async () => {
    const next = confirm.status === 'active' ? 'disabled' : 'active';
    try {
      await setUserStatus({ id: confirm.id, status: next }).unwrap();
      toast.success(next === 'active' ? 'User activated' : 'User deactivated and signed out');
      setConfirm(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'User',
      render: (u) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Monogram name={u.name} owner={u.isOwner} muted={u.status !== 'active'} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 0.75, rowGap: 0.25 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {u.name}
              </Typography>
              {u.isOwner && <Chip size="small" label="Owner" sx={{ ...smallChip, background: tokens.sidebar.goldGradient, color: '#171717', fontWeight: 700 }} />}
              {String(u.id) === String(session.user.id) && <Chip size="small" label="You" variant="outlined" sx={smallChip} />}
            </Stack>
            <Typography variant="body2" color="textSecondary" sx={{ overflowWrap: 'anywhere' }}>
              {u.email}
            </Typography>
            {u.mobile && (
              <Typography variant="caption" color="textSecondary">
                {u.mobile}
              </Typography>
            )}
          </Box>
        </Stack>
      ),
    },
    {
      key: 'roles',
      label: 'Role',
      render: (u) =>
        u.roles.length ? (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
            {u.roles.map((r) => (
              <Chip key={r.id ?? r.name} size="small" label={r.name} sx={goldChip} />
            ))}
          </Stack>
        ) : (
          <Muted>No role</Muted>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (u) => (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          <StatusDot active={u.status === 'active'} />
          {u.mustChangePassword && u.status === 'active' && <Chip size="small" label="Password pending" color="warning" variant="outlined" sx={smallChip} />}
        </Stack>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 132,
      render: (u) => (
        <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
          {canEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" sx={actionButton} onClick={() => setDrawer({ open: true, user: u })} aria-label={`Edit ${u.name}`}>
                <EditOutlinedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          )}
          {canEdit && !isProtected(u) && (
            <Tooltip title="Reset password">
              <IconButton size="small" sx={actionButton} onClick={() => setResetFor(u)} aria-label={`Reset password for ${u.name}`}>
                <KeyOutlinedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          )}
          {canToggle && !isProtected(u) && (
            <Tooltip title={u.status === 'active' ? 'Deactivate' : 'Activate'}>
              <IconButton
                size="small"
                sx={{ ...actionButton, color: u.status === 'active' ? 'error.main' : 'success.main', '&:hover': { borderColor: 'currentColor', bgcolor: 'transparent' } }}
                onClick={() => setConfirm(u)}
                aria-label={u.status === 'active' ? `Deactivate ${u.name}` : `Activate ${u.name}`}
              >
                <PowerSettingsNewRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Everyone who can sign in to your business, their roles and branches."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Users' }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawer({ open: true, user: null })}>
              Add user
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(u) => u.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={
          q || status || roleId
            ? { title: 'No matching users', description: 'Try a different search or filter.' }
            : { title: 'No users yet', description: 'Add team members and give them the roles they need.' }
        }
        pagination={data && { ...data.meta, onPageChange: setPage, onLimitChange: (l) => { setLimit(l); setPage(1); } }}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              placeholder="Search name, email or mobile"
              value={search}
              onChange={resetPage(setSearch)}
              sx={{ maxWidth: { sm: 320 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
            />
            <TextField select label="Status" value={status} onChange={resetPage(setStatus)} sx={{ maxWidth: { sm: 160 } }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="disabled">Disabled</MenuItem>
            </TextField>
            {roles.length > 0 && (
              <TextField select label="Role" value={roleId} onChange={resetPage(setRoleId)} sx={{ maxWidth: { sm: 220 } }}>
                <MenuItem value="">All roles</MenuItem>
                {roles.map((r) => (
                  <MenuItem key={r.id} value={r.id}>
                    {r.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        }
      />

      <UserFormDrawer open={drawer.open} user={drawer.user} onClose={() => setDrawer({ open: false, user: null })} />
      <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.status === 'active' ? 'Deactivate user?' : 'Activate user?'}
        message={
          confirm?.status === 'active'
            ? `${confirm?.name} will be signed out on all devices and can no longer sign in. Their history is kept.`
            : `${confirm?.name} will be able to sign in again.`
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
