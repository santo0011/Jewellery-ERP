import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { AVAILABLE_PERMISSIONS, isUpcomingPermission } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import { DisabledDelete } from '../../components/RowActions.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useDeleteRoleMutation, useDuplicateRoleMutation, useRolesQuery } from './roleApi.js';
import ViewButton from '../../components/ViewButton.jsx';
import { t } from '../../i18n/index.js';

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
      toast.success(t('Created "{{name}}"', { name: copy.name }));
      navigate(`/settings/roles/${copy.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const remove = async () => {
    try {
      await deleteRole(toDelete.id).unwrap();
      toast.success(t('Role deleted'));
      setToDelete(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setToDelete(null);
    }
  };

  const columns = [
    {
      key: 'name',
      label: t('Role'),
      render: (r) => (
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2">{r.isSystem ? t(r.name) : r.name}</Typography>
            {r.isSystem && <Chip size="small" label={r.customised ? t('Default · edited') : t('Default')} variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
          </Stack>
          {r.description && (
            <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 520 }}>
              {r.isSystem ? t(r.description) : r.description}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'permissions',
      label: t('Permissions'),
      render: (r) => (r.fullAccess ? <Typography variant="body2" color="accent" sx={{ fontWeight: 600 }}>{t('Full access')}</Typography> : t('{{count}} of {{count2}}', { count: r.permissions.filter((p) => !isUpcomingPermission(p)).length, count2: AVAILABLE_PERMISSIONS.length })),
    },
    { key: 'userCount', label: t('Users'), align: 'right', render: (r) => r.userCount },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 132,
      render: (r) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
          <ViewButton onClick={() => navigate(`/settings/roles/${r.id}`)} title={t('View permissions')} name={r.isSystem ? t(r.name) : r.name} />
          {canCreate && (
            <Tooltip title={t('Duplicate')}>
              <IconButton size="small" onClick={() => duplicate(r)} disabled={duplicating && duplicatingId === r.id} aria-label={t('Duplicate {{name}}', { name: r.isSystem ? t(r.name) : r.name })}>
                <ContentCopyRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {/* Delete is always shown; disabled with the reason when the role cannot go. */}
          {!canDelete ? (
            <DisabledDelete reason={t('You do not have permission to delete roles.')} />
          ) : r.isSystem ? (
            <DisabledDelete reason={t('Default roles cannot be deleted. You can change their permissions instead.')} />
          ) : r.userCount ? (
            <DisabledDelete reason={(r.userCount === 1 ? t('Assigned to {{userCount}} user. Give them another role first.', { userCount: r.userCount }) : t('Assigned to {{userCount}} users. Give them another role first.', { userCount: r.userCount }))} />
          ) : (
            <Tooltip title={t('Delete')}>
              <IconButton size="small" color="error" onClick={() => setToDelete(r)} aria-label={t('Delete {{name}}', { name: r.name })}>
                <DeleteOutlineRoundedIcon fontSize="small" />
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
        title={t('Roles & permissions')}
        subtitle={t('System roles cover common jewellery-shop jobs. Duplicate one to customise it.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Roles & permissions') }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/settings/roles/new')}>
              {t('New role')}
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
        empty={{ title: t('No roles found') }}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        title={t('Delete role?')}
        message={t('"{{name}}" will be permanently removed.', { name: toDelete?.name })}
        confirmLabel={t('Delete')}
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
