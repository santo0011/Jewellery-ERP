import { zodResolver } from '@hookform/resolvers/zod';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import { Alert, Box, Button, Card, CardContent, Grid, Paper, Stack, Typography } from '@mui/material';
import { ALL_PERMISSIONS } from '@jerp/shared';
import { roleSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import PermissionMatrix from './PermissionMatrix.jsx';
import { useCreateRoleMutation, useDuplicateRoleMutation, useRoleQuery, useUpdateRoleMutation } from './roleApi.js';

const EMPTY = { name: '', description: '', permissions: [] };

export default function RoleEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const canCreate = usePermission('role.create');
  const canEdit = usePermission('role.edit');

  const { data: role, isLoading, error, refetch } = useRoleQuery(id, { skip: isNew });
  const [createRole, createState] = useCreateRoleMutation();
  const [updateRole, updateState] = useUpdateRoleMutation();
  const [duplicateRole, duplicateState] = useDuplicateRoleMutation();

  const readOnly = isNew ? !canCreate : role?.isSystem || !canEdit;
  const { control, handleSubmit, reset, setError, formState, watch } = useForm({ resolver: zodResolver(roleSchema), defaultValues: EMPTY });

  useEffect(() => {
    if (role) reset({ name: role.name, description: role.description ?? '', permissions: role.permissions });
  }, [role, reset]);

  if (!isNew && isLoading) return <LoadingState label="Loading role" />;
  if (!isNew && error) return <ErrorState error={error} onRetry={refetch} />;

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (isNew) {
        const created = await createRole(values).unwrap();
        toast.success('Role created');
        navigate(`/settings/roles/${created.id}`, { replace: true });
      } else {
        const updated = await updateRole({ id, ...values }).unwrap();
        reset({ name: updated.name, description: updated.description ?? '', permissions: updated.permissions });
        toast.success('Role updated');
      }
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });

  const duplicate = async () => {
    try {
      const copy = await duplicateRole(id).unwrap();
      toast.success(`Created "${copy.name}"`);
      navigate(`/settings/roles/${copy.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const selectedCount = watch('permissions')?.length ?? 0;
  const saving = createState.isLoading || updateState.isLoading;

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      <PageHeader
        title={isNew ? 'New role' : role.name}
        subtitle={isNew ? 'Choose exactly what people with this role can do.' : role.description}
        back={{ to: '/settings/roles', label: 'Roles & permissions' }}
        actions={
          !isNew &&
          role.isSystem &&
          canCreate && (
            <Button variant="outlined" color="secondary" startIcon={<ContentCopyRoundedIcon />} onClick={duplicate} loading={duplicateState.isLoading}>
              Duplicate to customise
            </Button>
          )
        }
      />

      {!isNew && role.isSystem && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {role.fullAccess ? 'Organisation Admin has full access to everything and cannot be changed.' : 'System roles are read-only. Duplicate this role to make changes.'}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <CardContent>
              <Stack spacing={2}>
                <RHFTextField control={control} name="name" label="Role name" disabled={readOnly} />
                <RHFTextField control={control} name="description" label="Description" multiline minRows={3} disabled={readOnly} />
                <Box>
                  <Typography variant="overline" color="textSecondary">
                    Selected
                  </Typography>
                  <Typography variant="h3">
                    {selectedCount} <Typography component="span" variant="body2" color="textSecondary">of {ALL_PERMISSIONS.length} permissions</Typography>
                  </Typography>
                  {!isNew && (
                    <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                      Assigned to {role.userCount} user{role.userCount === 1 ? '' : 's'}
                    </Typography>
                  )}
                </Box>
                <Controller
                  name="permissions"
                  control={control}
                  render={({ fieldState }) => fieldState.error && <Alert severity="error">{fieldState.error.message}</Alert>}
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Controller
            name="permissions"
            control={control}
            render={({ field }) => <PermissionMatrix value={field.value} onChange={field.onChange} disabled={readOnly} />}
          />
        </Grid>
      </Grid>

      {!readOnly && (
        <Paper
          square
          sx={{
            position: 'sticky',
            bottom: { xs: 64, md: 0 },
            mt: 3,
            mx: { xs: -2, sm: -3, lg: -4 },
            px: { xs: 2, sm: 3, lg: 4 },
            py: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            zIndex: 2,
          }}
        >
          <Button color="secondary" onClick={() => navigate('/settings/roles')} disabled={saving}>
            {formState.isDirty ? 'Cancel' : 'Back'}
          </Button>
          <Button type="submit" variant="contained" loading={saving} disabled={!isNew && !formState.isDirty}>
            {isNew ? 'Create role' : 'Save changes'}
          </Button>
        </Paper>
      )}
    </Box>
  );
}
