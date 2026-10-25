import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, InputAdornment, Typography } from '@mui/material';
import { formatINR, fromPaise, KYC_DOC_TYPES, toPaise } from '@jerp/shared';
import { customerSchema } from '@jerp/shared/schemas';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import AddressFields from '../../components/form/AddressFields.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { ADVANCE_MODE_OPTIONS } from '../orders/orderUi.jsx';
import { useCreateCustomerMutation, useCustomerDuesQuery, useUpdateCustomerMutation } from './customerApi.js';
import { t } from '../../i18n/index.js';

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', stateCode: '', pincode: '' };
const EMPTY = {
  name: '', mobile: '', alternateMobile: '', email: '', address: EMPTY_ADDRESS, dob: '', anniversary: '', gstin: '', pan: '',
  kyc: { type: '', number: '', verified: false }, segment: 'new', preferredMetals: [], tags: [], balanceType: 'advance', openingBalance: '', advanceMode: 'cash', advanceReference: '', notes: '',
};

// One amount with its kind: money they owe you from before (old due) or money they paid you in advance.
// Saved as one opening balance: plus = due, minus = advance (used on their next bills).
const BALANCE_TYPES = [
  { value: 'advance', label: t('Advance paid') },
  { value: 'due', label: t('Old due') },
];
// How a new advance came in: paid now (a receipt in cash/bank, counted in today's collection) or an old balance.
const ADVANCE_RECEIVED = [...ADVANCE_MODE_OPTIONS, { value: 'old', label: t('Old balance — not received now') }];
const formSchema = customerSchema.omit({ openingBalancePaise: true, advancePayment: true }).extend({
  balanceType: z.enum(['advance', 'due']),
  advanceMode: z.string(),
  advanceReference: z.string().trim().max(60, t('Up to 60 characters')),
  openingBalance: z.string().refine((v) => {
    try {
      const paise = toPaise(v || '0');
      return paise !== null && paise >= 0;
    } catch {
      return false;
    }
  }, t('Enter a valid amount')),
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
        balanceType: c.openingBalancePaise > 0 ? 'due' : 'advance',
        // An advance shows only what is still available (bills may have used part or all of it — then it is empty).
        openingBalance:
          c.openingBalancePaise > 0
            ? String(fromPaise(c.openingBalancePaise))
            : (c.advanceLeftPaise ?? Math.max(0, -c.openingBalancePaise)) > 0
              ? String(fromPaise(c.advanceLeftPaise ?? -c.openingBalancePaise))
              : '',
        notes: blank(c.notes),
      }
    : EMPTY;

const SERVER_FIELD = { openingBalancePaise: 'openingBalance', 'advancePayment.mode': 'advanceMode', 'advancePayment.reference': 'advanceReference' };

const upper = (v) => v.toUpperCase();
const dateProps = { slotProps: { inputLabel: { shrink: true }, htmlInput: { max: new Date().toISOString().slice(0, 10) } }, type: 'date' };

/** `onCreated` (optional) receives the new customer instead of opening its page, for quick-add from orders and billing. */
export default function CustomerFormDrawer({ open, customer, onClose, onCreated }) {
  const navigate = useNavigate();
  const editing = Boolean(customer);
  const kycEditable = usePermission('customer.viewKyc') || !editing;
  const [create, createState] = useCreateCustomerMutation();
  const [update, updateState] = useUpdateCustomerMutation();
  const { control, handleSubmit, reset, setError, setValue, formState, watch } = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const balanceType = watch('balanceType');
  const [openingBalance, advanceMode] = watch(['openingBalance', 'advanceMode']);
  const { data: session } = useSession();
  const activeBranchId = useSelector((st) => st.auth.activeBranchId) ?? session?.branches?.[0]?.id;
  // While the customer owes anything, no new (or bigger) advance can be taken: the dues are settled first.
  const { data: dues } = useCustomerDuesQuery(customer?.id, { skip: !open || !editing });
  // Dues on bills (the old due is this very field, so changing it is a correction, not a new advance).
  const owes = editing ? (dues?.bills ?? []).reduce((n, b) => n + b.duePaise, 0) : 0;
  const advanceBefore = Math.max(0, -(customer?.openingBalancePaise ?? 0));
  const balanceOptions = BALANCE_TYPES.map((o) => (o.value === 'advance' && owes > 0 && advanceBefore === 0 ? { ...o, label: t('Advance paid — clear the due first'), disabled: true } : o));
  const error = editing ? updateState.error : createState.error;
  // The advance being added now: on edit the field holds what is still available (what bills used is added back).
  const advanceAdded = (() => {
    if (balanceType !== 'advance') return 0;
    try {
      return Math.max(0, (toPaise(openingBalance || '0') ?? 0) + (editing ? (customer.advanceUsedPaise ?? 0) : 0) - (editing ? advanceBefore : 0));
    } catch {
      return 0;
    }
  })();
  // Lowering the advance below what was received as money pays the difference back (out of cash/bank).
  const advanceRefund = (() => {
    const received = editing ? (customer.advanceReceivedPaise ?? 0) : 0;
    if (!received) return 0;
    try {
      const after = balanceType === 'advance' ? (toPaise(openingBalance || '0') ?? 0) + (customer.advanceUsedPaise ?? 0) : 0;
      return Math.max(0, received - after);
    } catch {
      return 0;
    }
  })();

  useEffect(() => {
    if (open) {
      reset({ advanceMode: 'cash', advanceReference: '', ...toForm(customer) });
      createState.reset();
      updateState.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customer, reset]);

  // A refund always goes out as money — "old balance" is not a way to pay back.
  useEffect(() => {
    if (advanceRefund > 0 && advanceMode === 'old') setValue('advanceMode', 'cash');
  }, [advanceRefund, advanceMode, setValue]);

  const onSubmit = handleSubmit(async ({ openingBalance, balanceType, advanceMode: mode, advanceReference, ...values }) => {
    const amount = toPaise(openingBalance || '0');
    // The field holds the advance still available; what bills already used stays on record (added back on save).
    const used = editing ? (customer.advanceUsedPaise ?? 0) : 0;
    if (used > 0 && balanceType === 'due' && amount > 0) {
      setError('openingBalance', { message: t('{{used}} of the advance is already used on bills — an old due cannot be set', { used: formatINR(used) }) });
      return;
    }
    if (owes > 0 && balanceType === 'advance' && amount + used > advanceBefore) {
      setError('openingBalance', { message: t('{{owes}} is due — collect it before taking an advance', { owes: formatINR(owes) }) });
      return;
    }
    const payload = {
      ...values,
      openingBalancePaise: balanceType === 'advance' || (used > 0 && amount === 0) ? -(amount + used) : amount,
      // A new advance paid now is recorded as a receipt at this branch (today's collection); an old balance is not.
      // An advance paid back goes out the same way (cash/bank) — always a refund receipt, never an old balance.
      advancePayment:
        (advanceAdded > 0 && mode !== 'old') || advanceRefund > 0 ? { branchId: activeBranchId, mode: mode === 'old' ? 'cash' : mode, reference: advanceReference || null } : null,
    };
    if (!kycEditable) {
      delete payload.pan;
      delete payload.kyc;
    }
    try {
      if (editing) {
        await update({ id: customer.id, ...payload }).unwrap();
        toast.success(t('Customer updated'));
        onClose();
      } else {
        const created = await create(payload).unwrap();
        toast.success(t('Customer {{code}} created', { code: created.code }));
        onClose();
        if (onCreated) onCreated(created);
        else navigate('/customers');
      }
    } catch (err) {
      // The server names the saved fields; show them on the form fields they come from.
      const toField = (path, e) => setError(SERVER_FIELD[path] ?? path, e);
      if (!applyServerErrors(err, toField)) toast.error(getErrorMessage(err));
    }
  });


  return (
    <FormDrawer
      open={open}
      title={editing ? t('Edit customer') : t('New customer')}
      subtitle={editing ? `${customer.name} · ${customer.code}` : t('Name and mobile are enough — the mobile finds them at the counter.')}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? t('Save changes') : t('Create customer')}
      width={560}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <RHFTextField control={control} name="name" label={t('Full name')} autoFocus={!editing} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label={t('Mobile')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="address.city" label={t('City / area')} />
        </Grid>
        {owes > 0 && (
          <Grid size={12}>
            <Alert severity="info" variant="outlined">
              {t('{{name}} owes {{amount}} on bills. A new advance can be taken once those dues are paid.', { name: customer.name, amount: <strong>{formatINR(owes)}</strong> })}
            </Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 5 }}>
          <RHFSelect control={control} name="balanceType" label={t('Opening balance')} options={balanceOptions} />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          <RHFTextField
            control={control}
            name="openingBalance"
            label={t('Amount (optional)')}
            helperText={
              balanceType === 'advance'
                ? owes > 0
                  ? <KeepOnPhone>{t('Cannot be more than {{Math}} while {{owes}} is due.', { Math: formatINR(Math.max(0, advanceBefore - (customer?.advanceUsedPaise ?? 0)), { decimals: 0 }), owes: formatINR(owes, { decimals: 0 }) })}</KeepOnPhone>
                  : customer?.advanceUsedPaise > 0
                    ? <KeepOnPhone>{t('Advance still available. {{advanceUsed}} was already used on bills.', { advanceUsed: formatINR(customer.advanceUsedPaise, { decimals: 0 }) })}</KeepOnPhone>
                    : t('Money they paid you in advance — used automatically on their next bills.')
                : t('What they already owe you from before — shows in their due.')
            }
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
          />
        </Grid>
        {advanceAdded > 0 && (
          <>
            <Grid size={{ xs: 12, sm: 5 }}>
              <RHFSelect
                control={control}
                name="advanceMode"
                label={editing ? t('Extra {{advanceAdded}} paid by', { advanceAdded: formatINR(advanceAdded, { decimals: 0 }) }) : t('Advance paid by')}
                options={ADVANCE_RECEIVED}
                helperText={advanceMode === 'old' ? t('Not added to today’s collection') : t('Added to today’s collection')}
              />
            </Grid>
            {advanceMode !== 'old' && advanceMode !== 'cash' && (
              <Grid size={{ xs: 12, sm: 7 }}>
                <RHFTextField control={control} name="advanceReference" label={t('Reference (optional)')} placeholder={t('Card / UPI / bank ref. no.')} />
              </Grid>
            )}
          </>
        )}
        {advanceRefund > 0 && (
          <>
            <Grid size={{ xs: 12, sm: 5 }}>
              <RHFSelect
                control={control}
                name="advanceMode"
                label={t('{{advanceRefund}} paid back by', { advanceRefund: formatINR(advanceRefund, { decimals: 0 }) })}
                options={ADVANCE_MODE_OPTIONS}
                helperText={t('Paid back to the customer — goes out of today’s cash / bank')}
              />
            </Grid>
            {advanceMode !== 'cash' && (
              <Grid size={{ xs: 12, sm: 7 }}>
                <RHFTextField control={control} name="advanceReference" label={t('Reference (optional)')} placeholder={t('UPI / bank ref. no.')} />
              </Grid>
            )}
          </>
        )}
        <Grid size={12}>
          <MoreDetails
            hint={t('Address, email, birthday, GSTIN, PAN / KYC, notes')}
            defaultOpen={Boolean(customer && (customer.email || customer.dob || customer.anniversary || customer.gstin || customer.kyc?.type || customer.notes || customer.address?.line1))}
            forceOpen={Boolean(Object.keys(formState.errors).some((k) => !['name', 'mobile', 'balanceType', 'openingBalance'].includes(k)))}
          >
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="alternateMobile" label={t('Alternate mobile')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="email" label={t('Email')} type="email" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="dob" label={t('Birthday')} {...dateProps} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="anniversary" label={t('Anniversary')} {...dateProps} />
              </Grid>
              <Grid size={12}>
                <AddressFields control={control} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="gstin" label={t('GSTIN')} transform={upper} helperText={t('Business customers only')} slotProps={{ htmlInput: { maxLength: 15 } }} />
              </Grid>
              {kycEditable ? (
                <>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="pan" label={t('PAN')} transform={upper} helperText={t('Needed for large bills')} slotProps={{ htmlInput: { maxLength: 10 } }} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFSelect control={control} name="kyc.type" label={t('ID document')} options={KYC_DOC_TYPES} placeholder={t('None')} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="kyc.number" label={t('Document number')} transform={upper} />
                  </Grid>
                </>
              ) : (
                <Grid size={12}>
                  <Alert severity="info">{t('PAN and ID details are hidden for your role and will stay unchanged.')}</Alert>
                </Grid>
              )}
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
