import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, InputAdornment } from '@mui/material';
import { decimalToScaledInt, formatINR, fromMg, fromPaise, SUPPLIER_SUPPLIES, toPaise } from '@jerp/shared';
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
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCreateSupplierMutation, useUpdateSupplierMutation } from './supplierApi.js';
import { t } from '../../i18n/index.js';

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
  }, t('Enter a valid number'));

// Old balance: what we owe the supplier from before — only a plus amount.
const oldBalance = z
  .string()
  .trim()
  .refine((v) => /^\d*(\.\d{0,2})?$/.test(v),t('Enter an amount (no minus) — what you owe them'))
  .refine((v) => {
    try {
      return (toPaise(v || '0') ?? -1) >= 0;
    } catch {
      return false;
    }
  }, t('Enter a valid amount'));

// The server names the saved fields; errors on them show on the form field they come from.
const SERVER_FIELD = { openingBalancePaise: 'openingBalance', openingFineGoldMg: 'openingGold', openingFineSilverMg: 'openingSilver' };

const formSchema = supplierSchema
  .omit({ openingBalancePaise: true, openingFineGoldMg: true, openingFineSilverMg: true, paymentTermsDays: true })
  .extend({ openingBalance: oldBalance, openingGold: decimal(3), openingSilver: decimal(3), paymentTermsDays: z.string().regex(/^\d{1,3}$/, t('Enter days (0–365)')) });

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
        openingBalance: String(fromPaise(Math.max(0, s.openingBalancePaise))),
        openingGold: String(fromMg(s.openingFineGoldMg)),
        openingSilver: String(fromMg(s.openingFineSilverMg)),
        notes: blank(s.notes),
      }
    : EMPTY;

const upper = (v) => v.toUpperCase();
// Digits and a decimal point only: a minus cannot be typed.
const amountOnly = (v) => v.replace(/[^\d.]/g, '');
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
        toast.success(t('Supplier updated'));
        onClose();
      } else {
        const created = await create(payload).unwrap();
        toast.success(t('Supplier {{code}} created', { code: created.code }));
        onClose();
        navigate('/suppliers');
      }
    } catch (err) {
      if (!applyServerErrors(err, (path, e) => setError(SERVER_FIELD[path] ?? path, e))) toast.error(getErrorMessage(err));
    }
  });


  return (
    <FormDrawer
      open={open}
      title={editing ? t('Edit supplier') : t('New supplier')}
      subtitle={editing ? `${supplier.companyName} · ${supplier.code}` : t('Bullion dealers, manufacturers, stone and packaging vendors.')}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? t('Save changes') : t('Create supplier')}
      width={560}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="companyName" label={t('Company name')} autoFocus={!editing} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="contactPerson" label={t('Contact person')} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label={t('Mobile')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="gstin" label={t('GSTIN')} transform={upper} slotProps={{ htmlInput: { maxLength: 15 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField
            control={control}
            name="openingBalance"
            label={t('Old balance (optional)')}
            transform={amountOnly}
            // Locked after the first purchase or payment with them: bills and payments are already settled against it.
            disabled={Boolean(supplier?.openingBalanceLocked)}
            helperText={
              supplier?.openingBalanceLocked
                ? <KeepOnPhone>{(supplier.openingDuePaidPaise > 0 ? t('Locked — {{companyName}} already has purchases or payments. {{openingDuePaid}} of it is paid.', { companyName: supplier.companyName, openingDuePaid: formatINR(supplier.openingDuePaidPaise, { decimals: 0 }) }) : t('Locked — {{companyName}} already has purchases or payments.', { companyName: supplier.companyName }))}</KeepOnPhone>
                : t('What you owe them from before — added to their due. Can be changed until the first purchase or payment.')
            }
            slotProps={unit('₹', 'start')}
          />
        </Grid>
        <Grid size={12}>
          <MoreDetails
            hint={t('Address, bank / UPI, metal balance, payment terms, notes')}
            defaultOpen={Boolean(supplier && (supplier.email || supplier.pan || supplier.address?.line1 || supplier.bankDetails?.accountNumber || supplier.bankDetails?.upiId || supplier.notes))}
            forceOpen={Boolean(Object.keys(formState.errors).some((k) => !['companyName', 'contactPerson', 'mobile', 'gstin', 'openingBalance'].includes(k)))}
          >
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="alternateMobile" label={t('Alternate mobile')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="email" label={t('Email')} type="email" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="pan" label={t('PAN')} transform={upper} slotProps={{ htmlInput: { maxLength: 10 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFMultiSelect control={control} name="supplies" label={t('Supplies')} options={SUPPLIER_SUPPLIES} />
              </Grid>
              <Grid size={12}>
                <AddressFields control={control} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.accountNumber" label={t('Bank account no.')} slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.ifsc" label={t('IFSC')} transform={upper} slotProps={{ htmlInput: { maxLength: 11 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.accountName" label={t('Account name')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bankDetails.upiId" label={t('UPI ID')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RHFTextField control={control} name="openingGold" label={t('Old fine gold')} helperText={t('You owe, in 24K g')} slotProps={unit('g')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RHFTextField control={control} name="openingSilver" label={t('Old fine silver')} slotProps={unit('g')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RHFTextField control={control} name="paymentTermsDays" label={t('Payment terms')} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('days')}</InputAdornment> }, htmlInput: { inputMode: 'numeric', 'data-number': true } }} />
              </Grid>
              <Grid size={12}>
                <RHFTextField control={control} name="notes" label={t('Notes')} multiline minRows={2} />
              </Grid>
            </Grid>
          </MoreDetails>
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
