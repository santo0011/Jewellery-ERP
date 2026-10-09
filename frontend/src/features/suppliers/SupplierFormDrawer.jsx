import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, InputAdornment } from '@mui/material';
import { decimalToScaledInt, fromMg, fromPaise, SUPPLIER_SUPPLIES, toPaise } from '@jerp/shared';
import { supplierSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import AddressFields from '../../components/form/AddressFields.jsx';
import RHFMultiSelect from '../../components/form/RHFMultiSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCreateSupplierMutation, useUpdateSupplierMutation } from './supplierApi.js';

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', stateCode: '', pincode: '' };
const EMPTY_BANK = { accountName: '', accountNumber: '', ifsc: '', bankName: '', branchName: '', upiId: '' };
const EMPTY = {
  companyName: '', contactPerson: '', mobile: '', alternateMobile: '', email: '', gstin: '', pan: '', address: EMPTY_ADDRESS,
  bankDetails: EMPTY_BANK, supplies: [], paymentTermsDays: '0', openingBalance: '0', openingGold: '0', openingSilver: '0', notes: '',
};

const decimal = (scale) =>
  z.string().refine((v) => {
    try {
      return decimalToScaledInt(v || '0', scale) !== null;
    } catch {
      return false;
    }
  }, 'Enter a valid number');

const formSchema = supplierSchema
  .omit({ openingBalancePaise: true, openingFineGoldMg: true, openingFineSilverMg: true, paymentTermsDays: true })
  .extend({ openingBalance: decimal(2), openingGold: decimal(3), openingSilver: decimal(3), paymentTermsDays: z.string().regex(/^\d{1,3}$/, 'Enter days (0–365)') });

const blank = (v) => v ?? '';
const blanks = (obj, empty) => ({ ...empty, ...Object.fromEntries(Object.entries(obj ?? {}).map(([k, v]) => [k, blank(v)])) });

const toForm = (s) =>
  s
    ? {
        companyName: s.companyName,
        contactPerson: blank(s.contactPerson),
        mobile: s.mobile,
        alternateMobile: blank(s.alternateMobile),
        email: blank(s.email),
        gstin: blank(s.gstin),
        pan: blank(s.pan),
        address: blanks(s.address, EMPTY_ADDRESS),
        bankDetails: blanks(s.bankDetails, EMPTY_BANK),
        supplies: s.supplies,
        paymentTermsDays: String(s.paymentTermsDays),
        openingBalance: String(fromPaise(s.openingBalancePaise)),
        openingGold: String(fromMg(s.openingFineGoldMg)),
        openingSilver: String(fromMg(s.openingFineSilverMg)),
        notes: blank(s.notes),
      }
    : EMPTY;

const upper = (v) => v.toUpperCase();
const unit = (text, position = 'end') => ({ input: { [`${position}Adornment`]: <InputAdornment position={position}>{text}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } });

export default function SupplierFormDrawer({ open, supplier, onClose }) {
  const navigate = useNavigate();
  const editing = Boolean(supplier);
  const [create, createState] = useCreateSupplierMutation();
  const [update, updateState] = useUpdateSupplierMutation();
  const { control, handleSubmit, reset, setError, formState } = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const error = editing ? updateState.error : createState.error;

  useEffect(() => {
    if (open) {
      reset(toForm(supplier));
      createState.reset();
      updateState.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier, reset]);

  const onSubmit = handleSubmit(async ({ openingBalance, openingGold, openingSilver, paymentTermsDays, ...values }) => {
    const payload = {
      ...values,
      paymentTermsDays: Number(paymentTermsDays),
      openingBalancePaise: toPaise(openingBalance || '0'),
      openingFineGoldMg: decimalToScaledInt(openingGold || '0', 3),
      openingFineSilverMg: decimalToScaledInt(openingSilver || '0', 3),
    };
    try {
      if (editing) {
        await update({ id: supplier.id, ...payload }).unwrap();
        toast.success('Supplier updated');
        onClose();
      } else {
        const created = await create(payload).unwrap();
        toast.success(`Supplier ${created.code} created`);
        onClose();
        navigate(`/suppliers/${created.id}`);
      }
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
  });


  return (
    <FormDrawer
      open={open}
      title={editing ? 'Edit supplier' : 'New supplier'}
      subtitle={editing ? `${supplier.companyName} · ${supplier.code}` : 'Bullion dealers, manufacturers, stone and packaging vendors.'}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? 'Save changes' : 'Create supplier'}
      width={560}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="companyName" label="Company name" autoFocus={!editing} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="contactPerson" label="Contact person" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label="Mobile" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="gstin" label="GSTIN" transform={upper} slotProps={{ htmlInput: { maxLength: 15 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="openingBalance" label="Old balance (optional)" helperText="What you owe them. Minus if they owe you." slotProps={unit('₹', 'start')} />
        </Grid>
        <Grid size={12}>
          <MoreDetails
            hint="Address, bank / UPI, metal balance, payment terms, notes"
            defaultOpen={Boolean(supplier && (supplier.email || supplier.pan || supplier.address?.line1 || supplier.bankDetails?.accountNumber || supplier.bankDetails?.upiId || supplier.notes))}
            forceOpen={Boolean(Object.keys(formState.errors).some((k) => !['companyName', 'contactPerson', 'mobile', 'gstin', 'openingBalance'].includes(k)))}
          >
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="alternateMobile" label="Alternate mobile" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="email" label="Email" type="email" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="pan" label="PAN" transform={upper} slotProps={{ htmlInput: { maxLength: 10 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFMultiSelect control={control} name="supplies" label="Supplies" options={SUPPLIER_SUPPLIES} />
              </Grid>
              <Grid size={12}>
                <AddressFields control={control} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.accountNumber" label="Bank account no." slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.ifsc" label="IFSC" transform={upper} slotProps={{ htmlInput: { maxLength: 11 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.accountName" label="Account name" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.upiId" label="UPI ID" />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RHFTextField control={control} name="openingGold" label="Old fine gold" helperText="You owe, in 24K g" slotProps={unit('g')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RHFTextField control={control} name="openingSilver" label="Old fine silver" slotProps={unit('g')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RHFTextField control={control} name="paymentTermsDays" label="Payment terms" slotProps={{ input: { endAdornment: <InputAdornment position="end">days</InputAdornment> }, htmlInput: { inputMode: 'numeric' } }} />
              </Grid>
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
