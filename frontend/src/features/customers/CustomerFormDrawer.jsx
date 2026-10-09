import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, InputAdornment, Typography } from '@mui/material';
import { fromPaise, KYC_DOC_TYPES, toPaise } from '@jerp/shared';
import { customerSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import AddressFields from '../../components/form/AddressFields.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCreateCustomerMutation, useUpdateCustomerMutation } from './customerApi.js';

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', stateCode: '', pincode: '' };
const EMPTY = {
  name: '', mobile: '', alternateMobile: '', email: '', address: EMPTY_ADDRESS, dob: '', anniversary: '', gstin: '', pan: '',
  kyc: { type: '', number: '', verified: false }, segment: 'new', preferredMetals: [], tags: [], openingBalance: '0', notes: '',
};

const formSchema = customerSchema.omit({ openingBalancePaise: true }).extend({
  openingBalance: z.string().refine((v) => {
    try {
      return toPaise(v || '0') !== null;
    } catch {
      return false;
    }
  }, 'Enter a valid amount'),
});

const blank = (v) => v ?? '';
const toForm = (c) =>
  c
    ? {
        name: c.name,
        mobile: c.mobile,
        alternateMobile: blank(c.alternateMobile),
        email: blank(c.email),
        address: { ...EMPTY_ADDRESS, ...Object.fromEntries(Object.entries(c.address ?? {}).map(([k, v]) => [k, blank(v)])) },
        dob: blank(c.dob),
        anniversary: blank(c.anniversary),
        gstin: blank(c.gstin),
        pan: c.kycVisible ? blank(c.pan) : '',
        kyc: { type: blank(c.kyc.type), number: c.kycVisible ? blank(c.kyc.number) : '', verified: c.kyc.verified },
        segment: c.segment,
        preferredMetals: c.preferredMetals,
        tags: c.tags,
        openingBalance: String(fromPaise(c.openingBalancePaise)),
        notes: blank(c.notes),
      }
    : EMPTY;

const upper = (v) => v.toUpperCase();
const dateProps = { slotProps: { inputLabel: { shrink: true }, htmlInput: { max: new Date().toISOString().slice(0, 10) } }, type: 'date' };

/** `onCreated` (optional) receives the new customer instead of opening its page, for quick-add from orders and billing. */
export default function CustomerFormDrawer({ open, customer, onClose, onCreated }) {
  const navigate = useNavigate();
  const editing = Boolean(customer);
  const kycEditable = usePermission('customer.viewKyc') || !editing;
  const [create, createState] = useCreateCustomerMutation();
  const [update, updateState] = useUpdateCustomerMutation();
  const { control, handleSubmit, reset, setError, formState } = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const error = editing ? updateState.error : createState.error;

  useEffect(() => {
    if (open) {
      reset(toForm(customer));
      createState.reset();
      updateState.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer, reset]);

  const onSubmit = handleSubmit(async ({ openingBalance, ...values }) => {
    const payload = { ...values, openingBalancePaise: toPaise(openingBalance || '0') };
    if (!kycEditable) {
      delete payload.pan;
      delete payload.kyc;
    }
    try {
      if (editing) {
        await update({ id: customer.id, ...payload }).unwrap();
        toast.success('Customer updated');
        onClose();
      } else {
        const created = await create(payload).unwrap();
        toast.success(`Customer ${created.code} created`);
        onClose();
        if (onCreated) onCreated(created);
        else navigate(`/customers/${created.id}`);
      }
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });


  return (
    <FormDrawer
      open={open}
      title={editing ? 'Edit customer' : 'New customer'}
      subtitle={editing ? `${customer.name} · ${customer.code}` : 'Name and mobile are enough — the mobile finds them at the counter.'}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? 'Save changes' : 'Create customer'}
      width={560}
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
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label="Mobile" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="address.city" label="City / area" />
        </Grid>
        <Grid size={12}>
          <RHFTextField
            control={control}
            name="openingBalance"
            label="Old due (optional)"
            helperText="What the customer already owes you from before. Use a minus sign for an advance you hold."
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
          />
        </Grid>
        <Grid size={12}>
          <MoreDetails
            hint="Address, email, birthday, GSTIN, PAN / KYC, notes"
            defaultOpen={Boolean(customer && (customer.email || customer.dob || customer.anniversary || customer.gstin || customer.kyc?.type || customer.notes || customer.address?.line1))}
            forceOpen={Boolean(Object.keys(formState.errors).some((k) => !['name', 'mobile', 'openingBalance'].includes(k)))}
          >
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="alternateMobile" label="Alternate mobile" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="email" label="Email" type="email" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="dob" label="Birthday" {...dateProps} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="anniversary" label="Anniversary" {...dateProps} />
              </Grid>
              <Grid size={12}>
                <AddressFields control={control} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="gstin" label="GSTIN" transform={upper} helperText="Business customers only" slotProps={{ htmlInput: { maxLength: 15 } }} />
              </Grid>
              {kycEditable ? (
                <>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="pan" label="PAN" transform={upper} helperText="Needed for large bills" slotProps={{ htmlInput: { maxLength: 10 } }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFSelect control={control} name="kyc.type" label="ID document" options={KYC_DOC_TYPES} placeholder="None" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="kyc.number" label="Document number" transform={upper} />
                  </Grid>
                </>
              ) : (
                <Grid size={12}>
                  <Alert severity="info">PAN and ID details are hidden for your role and will stay unchanged.</Alert>
                </Grid>
              )}
              <Grid size={12}>
                <RHFTextField control={control} name="notes" label="Notes" multiline minRows={2} />
              </Grid>
            </Grid>
          </MoreDetails>
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
