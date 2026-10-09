import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, Typography } from '@mui/material';
import { branchSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import AddressFields from '../../components/form/AddressFields.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { nullsToEmpty } from '../../utils/format.js';
import { useCreateBranchMutation, useUpdateBranchMutation } from './branchApi.js';

const EMPTY = { code: '', name: '', phone: '', email: '', gstin: '', address: { line1: '', line2: '', city: '', stateCode: '', pincode: '' } };
const upper = (v) => v.toUpperCase();

const toFormValues = (branch) => {
  if (!branch) return EMPTY;
  const v = nullsToEmpty(branch);
  return { code: v.code, name: v.name, phone: v.phone, email: v.email, gstin: v.gstin, address: { ...EMPTY.address, ...v.address } };
};

export default function BranchFormDrawer({ open, branch, onClose }) {
  const editing = Boolean(branch);
  const [createBranch, createState] = useCreateBranchMutation();
  const [updateBranch, updateState] = useUpdateBranchMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(branchSchema), defaultValues: EMPTY });
  const error = editing ? updateState.error : createState.error;

  useEffect(() => {
    if (open) {
      reset(toFormValues(branch));
      createState.reset();
      updateState.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branch, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (editing) await updateBranch({ id: branch._id, ...values }).unwrap();
      else await createBranch(values).unwrap();
      toast.success(editing ? 'Branch updated' : 'Branch created');
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <FormDrawer
      open={open}
      title={editing ? 'Edit branch' : 'New branch'}
      subtitle={editing ? branch.name : 'Each branch keeps its own stock, cash and reports.'}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? 'Save changes' : 'Create branch'}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 4 }}>
          <RHFTextField control={control} name="code" label="Code" transform={upper} helperText="e.g. KOL1" slotProps={{ htmlInput: { maxLength: 10 } }} autoFocus={!editing} />
        </Grid>
        <Grid size={{ xs: 12, sm: 8 }}>
          <RHFTextField control={control} name="name" label="Branch name" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="phone" label="Phone" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="email" label="Email" type="email" />
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name="gstin" label="GSTIN" transform={upper} helperText="Required if this branch has a separate GST registration" slotProps={{ htmlInput: { maxLength: 15 } }} />
        </Grid>
        <Grid size={12}>
          <Typography variant="overline" color="textSecondary">
            Address
          </Typography>
        </Grid>
        <Grid size={12}>
          <AddressFields control={control} />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
