import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Box, FormControlLabel, Grid, InputAdornment, Stack, Switch, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { formatINR, toPaise } from '@jerp/shared';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCreateAdvanceMutation, useEmployeeListQuery, useUpdateAdvanceMutation } from './hrApi.js';
import { monthLabel, PAY_MODES, remapErrors, salaryMonth, todayIso } from './hrUi.jsx';

const paiseOf = (v) => {
  try {
    return toPaise(v) ?? 0;
  } catch {
    return 0;
  }
};
const positive = (msg) => z.string().refine((v) => paiseOf(v) > 0, msg);

const schema = z
  .object({
    employeeId: z.string().min(1, 'Select an employee'),
    amount: positive('Enter the advance amount'),
    givenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date'),
    recoverFrom: z.string().regex(/^\d{4}-\d{2}$/, 'Pick the month'),
    plan: z.enum(['full', 'parts']),
    installment: z.string(),
    mode: z.string().min(1),
    reference: z.string().max(60),
    note: z.string().max(300),
    editing: z.boolean(),
    reason: z.string().max(200),
  })
  .superRefine((v, ctx) => {
    if (v.editing && v.reason.trim().length < 3) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Say why it is being changed' });
    if (v.givenOn > todayIso()) ctx.addIssue({ code: 'custom', path: ['givenOn'], message: 'Cannot be in the future' });
    if (v.plan !== 'parts') return;
    const inst = paiseOf(v.installment);
    if (inst <= 0) ctx.addIssue({ code: 'custom', path: ['installment'], message: 'Enter the amount to deduct each month' });
    else if (inst > paiseOf(v.amount)) ctx.addIssue({ code: 'custom', path: ['installment'], message: 'Cannot be more than the advance' });
  });

const money = { slotProps: { input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } } };

const addMonths = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const shortMonth = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** Month-by-month deductions for the preview. */
function schedule(amountPaise, installmentPaise, fromMonth) {
  if (!(amountPaise > 0) || !(installmentPaise > 0) || !fromMonth) return [];
  const out = [];
  for (let left = amountPaise, i = 0; left > 0 && i < 36; i += 1) {
    const cut = Math.min(installmentPaise, left);
    out.push({ month: addMonths(fromMonth, i), paise: cut });
    left -= cut;
  }
  return out;
}

const defaults = (employeeId = '') => ({ employeeId, amount: '', givenOn: todayIso(), recoverFrom: salaryMonth(), plan: 'full', installment: '', mode: 'cash', reference: '', note: '', editing: false, reason: '' });
const rupees = (p) => String(p / 100);
/** The form filled from an existing advance (edit mode). */
const fromAdvance = (a) => ({
  employeeId: String(a.employee?.id ?? ''),
  amount: rupees(a.amountPaise),
  givenOn: a.businessDate,
  recoverFrom: a.recoverFrom ?? salaryMonth(),
  plan: a.installmentPaise < a.amountPaise ? 'parts' : 'full',
  installment: a.installmentPaise < a.amountPaise ? rupees(a.installmentPaise) : '',
  mode: a.mode,
  reference: a.reference ?? '',
  note: a.note ?? '',
  editing: true,
  reason: '',
});

/** Give a salary advance. Pass `employee` to fix the employee (from their page), or `advance` to edit one (same day only). */
export default function AdvanceDrawer({ open, employee, advance, onClose }) {
  const editing = Boolean(advance);
  const [create, createState] = useCreateAdvanceMutation();
  const [update, updateState] = useUpdateAdvanceMutation();
  const state = editing ? updateState : createState;
  const { data: staff } = useEmployeeListQuery({ status: 'active', limit: 100 }, { skip: !open || Boolean(employee) || editing });
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(schema), defaultValues: defaults() });
  const [amount, installment, plan, recoverFrom, employeeId] = useWatch({ control, name: ['amount', 'installment', 'plan', 'recoverFrom', 'employeeId'] });

  useEffect(() => {
    if (open) reset(advance ? fromAdvance(advance) : defaults(employee?.id ?? ''));
  }, [open, employee, advance, reset]);

  const amountPaise = paiseOf(amount);
  const perMonth = plan === 'full' ? amountPaise : paiseOf(installment);
  const planRows = perMonth <= amountPaise ? schedule(amountPaise, perMonth, recoverFrom) : [];
  const chosen = employee ?? staff?.items?.find((e) => e.id === employeeId);

  const onSubmit = handleSubmit(async (v) => {
    const amountP = toPaise(v.amount);
    const body = {
      amountPaise: amountP,
      installmentPaise: v.plan === 'full' ? amountP : toPaise(v.installment),
      givenOn: v.givenOn,
      recoverFrom: v.recoverFrom,
      mode: v.mode,
      reference: v.reference || null,
      note: v.note || null,
    };
    try {
      if (editing) {
        const adv = await update({ id: advance.id, ...body, reason: v.reason.trim() }).unwrap();
        toast.success(`Advance ${adv.advanceNo} updated`);
      } else {
        const adv = await create({ employeeId: v.employeeId, ...body }).unwrap();
        toast.success(`Advance ${adv.advanceNo} of ${formatINR(adv.amountPaise, { decimals: 0 })} given to ${adv.employee.name}`);
      }
      onClose();
    } catch (err) {
      if (!applyServerErrors(remapErrors(err, { amountPaise: 'amount', installmentPaise: 'installment' }), setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <FormDrawer
      open={open}
      title={editing ? `Edit advance ${advance.advanceNo}` : 'Give salary advance'}
      subtitle={editing ? advance.employee?.name : employee ? `${employee.name} · ${employee.designation}` : 'Cut from the salary month you choose.'}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={state.isLoading}
      submitLabel={editing ? 'Save changes' : amountPaise ? `Give ${formatINR(amountPaise, { decimals: 0 })}` : 'Give advance'}
      width={480}
    >
      <Stack spacing={2.5}>
        {editing && (
          <Alert severity="warning" icon={false}>
            Advances can be corrected only on the day they are entered. Every change is saved in the history with your reason.
          </Alert>
        )}
        {!employee && !editing && <RHFSelect control={control} name="employeeId" label="Employee" placeholder="Select employee" options={(staff?.items ?? []).map((e) => ({ value: e.id, label: `${e.name} · ${e.designation}` }))} />}

        <RHFTextField
          control={control}
          name="amount"
          label="Amount"
          autoFocus
          {...money}
          helperText={chosen?.grossPaise ? `Salary ${formatINR(chosen.grossPaise, { decimals: 0 })} / month` : ' '}
          sx={{ '& input': { fontSize: '1.25rem', fontWeight: 600 } }}
        />

        <Box>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 0.5 }}>
            Paid by
          </Typography>
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <ToggleButtonGroup exclusive fullWidth size="small" value={field.value} onChange={(e, v) => v && field.onChange(v)} sx={{ height: 40 }}>
                {PAY_MODES.map((m) => (
                  <ToggleButton key={m.value} value={m.value}>
                    {m.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            )}
          />
        </Box>

        <Grid container spacing={2}>
          <Grid size={6}>
            <RHFTextField control={control} name="givenOn" label="Given on" type="date" slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIso() } }} />
          </Grid>
          <Grid size={6}>
            <RHFTextField control={control} name="recoverFrom" label="Cut from salary of" type="month" slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
        </Grid>

        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, px: 1.5, py: 1 }}>
          <Controller
            control={control}
            name="plan"
            render={({ field }) => (
              <FormControlLabel
                control={<Switch checked={field.value === 'parts'} onChange={(e) => field.onChange(e.target.checked ? 'parts' : 'full')} />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Cut in monthly parts
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Off = the whole amount is cut from one salary
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%', justifyContent: 'space-between', flexDirection: 'row-reverse', gap: 1 }}
              />
            )}
          />
          {plan === 'parts' && (
            <Box sx={{ mt: 1.5, mb: 0.5 }}>
              <RHFTextField control={control} name="installment" label="Cut each month" {...money} />
            </Box>
          )}
        </Box>

        {planRows.length > 0 && (
          <Box sx={{ p: 1.75, borderRadius: 2, border: '1px solid rgba(201, 162, 39, 0.35)', bgcolor: 'rgba(201, 162, 39, 0.06)' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {planRows.length === 1
                ? `${formatINR(amountPaise, { decimals: 0 })} will be cut from ${monthLabel(planRows[0].month)} salary`
                : `${formatINR(perMonth, { decimals: 0 })} cut each month · ${shortMonth(planRows[0].month)} to ${shortMonth(planRows.at(-1).month)} (${planRows.length} months)`}
            </Typography>
            {chosen?.grossPaise > 0 && planRows[0].paise > chosen.grossPaise && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'warning.dark' }}>
                More than one month’s salary — what the salary can’t cover is taken the next month.
              </Typography>
            )}
          </Box>
        )}

        {editing && <RHFTextField control={control} name="reason" label="Reason for the change" placeholder="e.g. Typed the wrong amount" />}

        <MoreDetails hint="Reference, reason" defaultOpen={editing && Boolean(advance.reference || advance.note)}>
          <Stack spacing={2}>
            <RHFTextField control={control} name="reference" label="Reference" helperText="UPI / transfer ref." />
            <RHFTextField control={control} name="note" label="Reason" multiline minRows={2} />
          </Stack>
        </MoreDetails>
      </Stack>
    </FormDrawer>
  );
}
