import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, Typography } from '@mui/material';
import { branchSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import PincodeAddressFields, { addressFormValues } from '../../components/form/PincodeAddressFields.jsx';
import { useLazyPincodeQuery } from '../settings/organisationApi.js';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { nullsToEmpty } from '../../utils/format.js';
import { useCreateBranchMutation, useUpdateBranchMutation } from './branchApi.js';
import { t } from '../../i18n/index.js';

// Same address fields as the organisation's (ADDRESS_FIELDS); the state lives in the address here.
const EMPTY = { code: '', name: '', phone: '', email: '', gstin: '', address: { ...addressFormValues(), stateCode: '' } };
const upper = (v) => v.toUpperCase();

const toFormValues = (branch) => {
  if (!branch) return EMPTY;
  const v = nullsToEmpty(branch);
  return { code: v.code, name: v.name, phone: v.phone, email: v.email, gstin: v.gstin, address: { ...addressFormValues(branch.address), stateCode: v.address?.stateCode ?? '' } };
};

export default function BranchFormDrawer({ open, branch, onClose }) {
  const editing = Boolean(branch);
  const [createBranch, createState] = useCreateBranchMutation();
  const [updateBranch, updateState] = useUpdateBranchMutation();
  const { control, handleSubmit, reset, setError, setValue } = useForm({ resolver: zodResolver(branchSchema), defaultValues: EMPTY });
  const [findPincode] = useLazyPincodeQuery();
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
      toast.success(editing ? t('Branch updated') : t('Branch created'));
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <FormDrawer
      width={640}
      open={open}
      title={editing ? t('Edit branch') : t('New branch')}
      subtitle={editing ? branch.name : t('Each branch keeps its own stock, cash and reports.')}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? t('Save changes') : t('Create branch')}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 4 }}>
          <RHFTextField control={control} name="code" label={t('Code')} transform={upper} helperText={t('e.g. KOL1')} slotProps={{ htmlInput: { maxLength: 10 } }} autoFocus={!editing} />
        </Grid>
        <Grid size={{ xs: 12, sm: 8 }}>
          <RHFTextField control={control} name="name" label={t('Branch name')} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="phone" label={t('Phone')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="email" label={t('Email')} type="email" />
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name="gstin" label={t('GSTIN')} transform={upper} helperText={t('Required if this branch has a separate GST registration')} slotProps={{ htmlInput: { maxLength: 15 } }} />
        </Grid>
        <Grid size={12}>
          <Typography variant="overline" color="textSecondary" sx={{ display: 'block' }}>
            {t('Address')}
          </Typography>
          {branch?.isHeadOffice && (
            <Alert severity="info" variant="outlined" sx={{ mt: 0.5 }}>
              {t('This is also the organisation’s registered address — saving it here updates Settings → Organisation (and what the Super Admin sees), and the other way round.')}
            </Alert>
          )}
        </Grid>
        <Grid size={12}>
          <PincodeAddressFields control={control} setValue={setValue} stateField="address.stateCode" lookup={(pin) => findPincode(pin, true).unwrap()} />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
