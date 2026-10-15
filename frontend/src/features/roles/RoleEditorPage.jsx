import { zodResolver } from '@hookform/resolvers/zod';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { Alert, Box, Button, Card, CardContent, Divider, Grid, InputAdornment, LinearProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import { AVAILABLE_PERMISSIONS, isBranchRole, isOrganisationLevel, isUpcomingPermission } from '@jerp/shared';
import { roleSchema } from '@jerp/shared/schemas';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { fonts } from '../../theme/tokens.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import PermissionMatrix, { ALL_BRANCHES_NOTE, permissionGroups } from './PermissionMatrix.jsx';
import { useCreateRoleMutation, useDuplicateRoleMutation, useRoleQuery, useUpdateRoleMutation } from './roleApi.js';

const EMPTY = { name: '', description: '', permissions: [] };
const BRANCH_AVAILABLE = AVAILABLE_PERMISSIONS.filter((p) => !isOrganisationLevel(p));

const Bar = ({ value, height = 6 }) => (
  <LinearProgress
    variant="determinate"
    value={value}
    sx={{ height, borderRadius: height, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: height, background: 'linear-gradient(90deg, var(--brand-light), var(--brand) 60%, var(--brand-deep))' } }}
  />
);

/** How much of the app the role opens: the total, then each area group as a small bar. */
function Coverage({ permissions, branchRole }) {
  const GROUPS = useMemo(() => permissionGroups(undefined, branchRole), [branchRole]);
  const AVAILABLE = branchRole ? BRANCH_AVAILABLE : AVAILABLE_PERMISSIONS;
  const selected = useMemo(() => new Set(permissions), [permissions]);
  const on = AVAILABLE.filter((p) => selected.has(p)).length;
  const total = AVAILABLE.length;
  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography variant="overline" color="textSecondary">
          Access
        </Typography>
        <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 26, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {on}
          <Typography component="span" color="textSecondary" sx={{ fontFamily: 'inherit', fontSize: 16, fontWeight: 600 }}>
            {' '}
            / {total}
          </Typography>
        </Typography>
      </Stack>
      <Bar value={total ? (on / total) * 100 : 0} height={8} />
      {/* Per area: tablets and up (phones keep the card short). */}
      <Stack spacing={1} sx={{ mt: 2, display: { xs: 'none', sm: 'flex' } }}>
        {GROUPS.map((g) => {
          const keys = g.modules.flatMap((m) => m.actions.map((a) => a.key));
          const n = keys.filter((k) => selected.has(k)).length;
          return (
            <Box key={g.name} sx={{ display: 'grid', gridTemplateColumns: '96px 1fr 38px', gap: 1.25, alignItems: 'center' }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: n ? 'text.primary' : 'text.secondary' }} noWrap>
                {g.name}
              </Typography>
              <Bar value={(n / keys.length) * 100} height={5} />
              <Typography variant="caption" color="textSecondary" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {n}/{keys.length}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

export default function RoleEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const canCreate = usePermission('role.create');
  const canEdit = usePermission('role.edit');
  const [search, setSearch] = useState('');

  const { data: role, isLoading, error, refetch } = useRoleQuery(id, { skip: isNew });
  const [createRole, createState] = useCreateRoleMutation();
  const [updateRole, updateState] = useUpdateRoleMutation();
  const [duplicateRole, duplicateState] = useDuplicateRoleMutation();

  // Default roles can be edited; only Organisation Admin (full access) is fixed.
  const readOnly = isNew ? !canCreate : role?.fullAccess || !canEdit;
  const branchRole = isBranchRole(role?.key);
  const { control, handleSubmit, reset, setError, setValue, formState } = useForm({ resolver: zodResolver(roleSchema), defaultValues: EMPTY });
  const permissions = useWatch({ control, name: 'permissions' }) ?? [];

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

  // Everything / nothing the app offers today; permissions for upcoming features are left as they are.
  const setAll = (on) =>
    setValue('permissions', on ? [...new Set([...permissions, ...(branchRole ? BRANCH_AVAILABLE : AVAILABLE_PERMISSIONS)])] : permissions.filter(isUpcomingPermission), { shouldDirty: true, shouldValidate: true });

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
              Duplicate as a new role
            </Button>
          )
        }
      />

      {branchRole && (
        <Alert severity="info" icon={<PublicOutlinedIcon />} sx={{ mb: 2.5 }}>
          {role.name} is a branch role: it runs particular branches and never the organisation, so organisation-level permissions (branches, users, roles, settings, audit log, subscription…) are not offered. People with this role always work in chosen branches.
        </Alert>
      )}

      {!isNew && role.isSystem && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {role.fullAccess
            ? 'Organisation Admin has full access to everything and cannot be changed.'
            : `A default role${role.customised ? ' — its permissions have been changed for your business' : ''}. Turn permissions on or off and save to change what it allows; it cannot be deleted.`}
        </Alert>
      )}

      <Grid container spacing={{ xs: 2, md: 3 }}>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ position: { lg: 'sticky' }, top: { lg: 88 }, overflow: 'hidden' }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', px: 2.5, py: 1.75, background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.16) 0%, rgba(var(--brand-rgb), 0.04) 100%)', borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ width: 38, height: 38, borderRadius: 2.5, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--brand-light), var(--brand) 55%, var(--brand-deep))', color: 'var(--brand-contrast)', boxShadow: '0 6px 14px -6px rgba(var(--brand-rgb), 0.7)' }}>
                <ShieldOutlinedIcon sx={{ fontSize: 21 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{role?.fullAccess ? 'Full access' : 'Role details'}</Typography>
                {!isNew && (
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <GroupOutlinedIcon sx={{ fontSize: 15 }} />
                    <Typography variant="caption">
                      {role.userCount} user{role.userCount === 1 ? '' : 's'} with this role
                    </Typography>
                  </Stack>
                )}
              </Box>
            </Stack>
            <CardContent sx={{ p: 2.5 }}>
              <Stack spacing={2}>
                <RHFTextField control={control} name="name" label="Role name" disabled={readOnly} />
                <RHFTextField control={control} name="description" label="Description" multiline minRows={2} disabled={readOnly} />
                <Divider />
                <Coverage permissions={permissions} branchRole={branchRole} />
                {!readOnly && (
                  <Stack direction="row" spacing={1}>
                    <Button size="small" variant="outlined" color="secondary" fullWidth onClick={() => setAll(true)}>
                      Allow everything
                    </Button>
                    <Button size="small" variant="outlined" color="secondary" fullWidth onClick={() => setAll(false)}>
                      Clear all
                    </Button>
                  </Stack>
                )}
                <Controller name="permissions" control={control} render={({ fieldState }) => fieldState.error && <Alert severity="error">{fieldState.error.message}</Alert>} />
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 8 }}>
          <TextField
            fullWidth
            size="small"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a permission — discount, cost price, payroll…"
            sx={{ mb: 1, '& .MuiInputBase-root': { bgcolor: 'background.paper' } }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }, htmlInput: { 'aria-label': 'Find a permission' } }}
          />
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 2, color: 'text.secondary' }}>
            <PublicOutlinedIcon sx={{ fontSize: 15 }} />
            <Typography variant="caption">{ALL_BRANCHES_NOTE}</Typography>
          </Stack>
          <Controller name="permissions" control={control} render={({ field }) => <PermissionMatrix value={field.value} onChange={field.onChange} disabled={readOnly} search={search} branchRole={branchRole} />} />
        </Grid>
      </Grid>

      {!readOnly && (
        <Paper
          square
          sx={{
            // Desktop: a bar along the bottom edge. Phones: a floating card just above the bottom navigation.
            position: 'sticky',
            bottom: { xs: 'calc(84px + env(safe-area-inset-bottom))', md: 0 },
            mt: 3,
            mx: { xs: 0, md: -3, lg: -4 },
            px: { xs: 1.5, md: 3, lg: 4 },
            py: 1.5,
            border: { xs: 1, md: 0 },
            borderTop: 1,
            borderColor: 'divider',
            borderRadius: { xs: 3, md: 0 },
            boxShadow: { xs: '0 10px 30px -10px rgba(23, 23, 23, 0.3)', md: 'none' },
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            zIndex: 2,
            '& .MuiButton-root': { flex: { xs: 1, md: 'none' } },
          }}
        >
          {formState.isDirty && (
            <Typography variant="body2" color="textSecondary" sx={{ display: { xs: 'none', md: 'block' }, mr: 'auto' }}>
              Unsaved changes
            </Typography>
          )}
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
