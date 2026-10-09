import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { ALL_PERMISSIONS } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useDeleteRoleMutation, useDuplicateRoleMutation, useRolesQuery } from './roleApi.js';
import ViewButton from '../../components/ViewButton.jsx';

export default function RolesPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('role.create');
  const canDelete = usePermission('role.delete');
  const { data, isLoading, isFetching, error, refetch } = useRolesQuery();
  const [duplicateRole, { isLoading: duplicating, originalArgs: duplicatingId }] = useDuplicateRoleMutation();
  const [deleteRole, { isLoading: deleting }] = useDeleteRoleMutation();
  const [toDelete, setToDelete] = useState(null);

  const duplicate = async (role) => {
    try {
      const copy = await duplicateRole(role.id).unwrap();
      toast.success(`Created "${copy.name}"`);
      navigate(`/settings/roles/${copy.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const remove = async () => {
    try {
      await deleteRole(toDelete.id).unwrap();
      toast.success('Role deleted');
      setToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setToDelete(null);
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Role',
      render: (r) => (
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2">{r.name}</Typography>
            {r.isSystem && <Chip size="small" label="System" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
          </Stack>
          {r.description && (
            <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 520 }}>
              {r.description}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'permissions',
      label: 'Permissions',
      render: (r) => (r.fullAccess ? <Typography variant="body2" color="accent" sx={{ fontWeight: 600 }}>Full access</Typography> : `${r.permissions.length} of ${ALL_PERMISSIONS.length}`),
    },
    { key: 'userCount', label: 'Users', align: 'right', render: (r) => r.userCount },
    {
      key: 'actions',
      label: '',
      align: 'right',
      width: 132,
      render: (r) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <ViewButton onClick={() => navigate(`/settings/roles/${r.id}`)} title="View permissions" name={r.name} />
          {canCreate && (
            <Tooltip title="Duplicate">
              <IconButton size="small" onClick={() => duplicate(r)} disabled={duplicating && duplicatingId === r.id} aria-label={`Duplicate ${r.name}`}>
                <ContentCopyRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canDelete && !r.isSystem && (
            <Tooltip title={r.userCount ? 'Reassign users before deleting' : 'Delete'}>
              <span>
                <IconButton size="small" color="error" onClick={() => setToDelete(r)} disabled={r.userCount > 0} aria-label={`Delete ${r.name}`}>
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Roles & permissions"
        subtitle="System roles cover common jewellery-shop jobs. Duplicate one to customise it."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Roles & permissions' }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/settings/roles/new')}>
              New role
            </Button>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={data}
        getRowId={(r) => r.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: 'No roles found' }}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete role?"
        message={`"${toDelete?.name}" will be permanently removed.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
