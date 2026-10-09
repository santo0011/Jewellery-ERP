import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, Typography } from '@mui/material';
import { createUserSchema, updateUserSchema } from '@jerp/shared/schemas';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import PasswordField from '../../components/form/PasswordField.jsx';
import RHFMultiSelect from '../../components/form/RHFMultiSelect.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFSwitch from '../../components/form/RHFSwitch.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useRolesQuery } from '../roles/roleApi.js';
import { useCreateUserMutation, useUpdateUserMutation } from './userApi.js';

const EMPTY = { name: '', email: '', mobile: '', password: '', roleIds: [], branchAccess: { all: false, branchIds: [] }, defaultBranchId: '' };

const toFormValues = (user) =>
  user
    ? {
        name: user.name,
        mobile: user.mobile ?? '',
        roleIds: user.roles.map((r) => String(r.id)),
        branchAccess: { all: user.branchAccess.all, branchIds: user.branchAccess.branches.map((b) => String(b.id)) },
        defaultBranchId: user.defaultBranch ? String(user.defaultBranch.id) : '',
      }
    : EMPTY;

export default function UserFormDrawer({ open, user, onClose }) {
  const editing = Boolean(user);
  const { data: session } = useSession();
  const { data: roles = [] } = useRolesQuery(undefined, { skip: !open });
  const [createUser, createState] = useCreateUserMutation();
  const [updateUser, updateState] = useUpdateUserMutation();

  const isSelf = editing && String(user.id) === String(session.user.id);
  const accessLocked = editing && (user.isOwner || isSelf);

  const { control, handleSubmit, reset, setError, setValue } = useForm({
    resolver: zodResolver(editing ? updateUserSchema : createUserSchema),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (open) {
      reset(toFormValues(user));
      createState.reset();
      updateState.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user, reset]);

  const allBranches = useWatch({ control, name: 'branchAccess.all' });
  const branchIds = useWatch({ control, name: 'branchAccess.branchIds' });
  const defaultBranchId = useWatch({ control, name: 'defaultBranchId' });

  const branchOptions = useMemo(() => session.branches.map((b) => ({ value: String(b.id), label: b.name, description: b.code })), [session.branches]);
  const defaultOptions = useMemo(
    () => (allBranches ? branchOptions : branchOptions.filter((b) => (branchIds ?? []).includes(b.value))),
    [allBranches, branchIds, branchOptions],
  );

  useEffect(() => {
    if (defaultBranchId && !defaultOptions.some((o) => o.value === defaultBranchId)) setValue('defaultBranchId', '');
  }, [defaultOptions, defaultBranchId, setValue]);

  const roleOptions = roles.map((r) => ({
    value: String(r.id),
    label: r.name,
    description: r.fullAccess ? 'Full access' : `${r.permissions.length} permissions`,
  }));

  const error = editing ? updateState.error : createState.error;

  const onSubmit = handleSubmit(async (values) => {
    const payload = { ...values, branchAccess: { all: values.branchAccess.all, branchIds: values.branchAccess.all ? [] : values.branchAccess.branchIds } };
    try {
      if (editing) await updateUser({ id: user.id, ...payload }).unwrap();
      else await createUser(payload).unwrap();
      toast.success(editing ? 'User updated' : 'User created. Share the temporary password with them securely.');
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <FormDrawer
      open={open}
      title={editing ? 'Edit user' : 'Add user'}
      subtitle={editing ? user.email : 'They will be asked to set their own password at first sign-in.'}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? 'Save changes' : 'Create user'}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="name" label="Full name" autoFocus={!editing} />
        </Grid>
        {!editing && (
          <Grid size={12}>
            <RHFTextField control={control} name="email" label="Email" type="email" helperText="Used to sign in" />
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: editing ? 12 : 6 }}>
          <RHFTextField control={control} name="mobile" label="Mobile" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        {!editing && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <PasswordField control={control} name="password" label="Temporary password" autoComplete="new-password" helperText="At least 6 characters" />
          </Grid>
        )}

        <Grid size={12}>
          <Typography variant="overline" color="textSecondary">
            Access
          </Typography>
        </Grid>
        {accessLocked && (
          <Grid size={12}>
            <Alert severity="info">{user.isOwner ? 'The owner always keeps full access.' : 'You cannot change your own roles or branch access.'}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFMultiSelect control={control} name="roleIds" label="Roles" options={roleOptions} disabled={accessLocked} helperText="Permissions from all selected roles are combined" />
        </Grid>
        <Grid size={12}>
          <RHFSwitch control={control} name="branchAccess.all" label="All branches" description="Includes branches added in future" disabled={accessLocked} />
        </Grid>
        {!allBranches && (
          <Grid size={12}>
            <RHFMultiSelect control={control} name="branchAccess.branchIds" label="Branches" options={branchOptions} disabled={accessLocked} />
          </Grid>
        )}
        <Grid size={12}>
          <RHFSelect control={control} name="defaultBranchId" label="Default branch" options={defaultOptions} placeholder="None" helperText="Selected automatically after sign-in" />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
