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

const EMPTY_ADDRESS = { line1: '', line2: '', city: '', stateCode: '', pincode: '' };
const EMPTY = {
  name: '', mobile: '', alternateMobile: '', email: '', address: EMPTY_ADDRESS, dob: '', anniversary: '', gstin: '', pan: '',
  kyc: { type: '', number: '', verified: false }, segment: 'new', preferredMetals: [], tags: [], balanceType: 'advance', openingBalance: '', advanceMode: 'cash', advanceReference: '', notes: '',
};

// One amount with its kind: money they owe you from before (old due) or money they paid you in advance.
// Saved as one opening balance: plus = due, minus = advance (used on their next bills).
const BALANCE_TYPES = [
  { value: 'advance', label: 'Advance paid' },
  { value: 'due', label: 'Old due' },
];
// How a new advance came in: paid now (a receipt in cash/bank, counted in today's collection) or an old balance.
const ADVANCE_RECEIVED = [...ADVANCE_MODE_OPTIONS, { value: 'old', label: 'Old balance — not received now' }];
const formSchema = customerSchema.omit({ openingBalancePaise: true, advancePayment: true }).extend({
  balanceType: z.enum(['advance', 'due']),
  advanceMode: z.string(),
  advanceReference: z.string().trim().max(60, 'Up to 60 characters'),
  openingBalance: z.string().refine((v) => {
    try {
      const paise = toPaise(v || '0');
      return paise !== null && paise >= 0;
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
  const balanceOptions = BALANCE_TYPES.map((o) => (o.value === 'advance' && owes > 0 && advanceBefore === 0 ? { ...o, label: 'Advance paid — clear the due first', disabled: true } : o));
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
      setError('openingBalance', { message: `${formatINR(used)} of the advance is already used on bills — an old due cannot be set` });
      return;
    }
    if (owes > 0 && balanceType === 'advance' && amount + used > advanceBefore) {
      setError('openingBalance', { message: `${formatINR(owes)} is due — collect it before taking an advance` });
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
        toast.success('Customer updated');
        onClose();
      } else {
        const created = await create(payload).unwrap();
        toast.success(`Customer ${created.code} created`);
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
        {owes > 0 && (
          <Grid size={12}>
            <Alert severity="info" variant="outlined">
              {customer.name} owes <strong>{formatINR(owes)}</strong> on bills. A new advance can be taken once those dues are paid.
            </Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 5 }}>
          <RHFSelect control={control} name="balanceType" label="Opening balance" options={balanceOptions} />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          <RHFTextField
            control={control}
            name="openingBalance"
            label="Amount (optional)"
            helperText={
              balanceType === 'advance'
                ? owes > 0
                  ? <KeepOnPhone>{`Cannot be more than ${formatINR(Math.max(0, advanceBefore - (customer?.advanceUsedPaise ?? 0)), { decimals: 0 })} while ${formatINR(owes, { decimals: 0 })} is due.`}</KeepOnPhone>
                  : customer?.advanceUsedPaise > 0
                    ? <KeepOnPhone>{`Advance still available. ${formatINR(customer.advanceUsedPaise, { decimals: 0 })} was already used on bills.`}</KeepOnPhone>
                    : 'Money they paid you in advance — used automatically on their next bills.'
                : 'What they already owe you from before — shows in their due.'
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
                label={editing ? `Extra ${formatINR(advanceAdded, { decimals: 0 })} paid by` : 'Advance paid by'}
                options={ADVANCE_RECEIVED}
                helperText={advanceMode === 'old' ? 'Not added to today’s collection' : 'Added to today’s collection'}
              />
            </Grid>
            {advanceMode !== 'old' && advanceMode !== 'cash' && (
              <Grid size={{ xs: 12, sm: 7 }}>
                <RHFTextField control={control} name="advanceReference" label="Reference (optional)" placeholder="Card / UPI / bank ref. no." />
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
                label={`${formatINR(advanceRefund, { decimals: 0 })} paid back by`}
                options={ADVANCE_MODE_OPTIONS}
                helperText="Paid back to the customer — goes out of today’s cash / bank"
              />
            </Grid>
            {advanceMode !== 'cash' && (
              <Grid size={{ xs: 12, sm: 7 }}>
                <RHFTextField control={control} name="advanceReference" label="Reference (optional)" placeholder="UPI / bank ref. no." />
              </Grid>
            )}
          </>
        )}
        <Grid size={12}>
          <MoreDetails
            hint="Address, email, birthday, GSTIN, PAN / KYC, notes"
            defaultOpen={Boolean(customer && (customer.email || customer.dob || customer.anniversary || customer.gstin || customer.kyc?.type || customer.notes || customer.address?.line1))}
            forceOpen={Boolean(Object.keys(formState.errors).some((k) => !['name', 'mobile', 'balanceType', 'openingBalance'].includes(k)))}
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
