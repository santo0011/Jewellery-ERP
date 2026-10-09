import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, InputAdornment } from '@mui/material';
import { formatINR, toPaise } from '@jerp/shared';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCreateAdvanceMutation, useEmployeeListQuery } from './hrApi.js';
import { PAY_MODES, remapErrors } from './hrUi.jsx';

const amount = (msg) =>
  z.string().refine((v) => {
    try {
      return (toPaise(v) ?? 0) > 0;
    } catch {
      return false;
    }
  }, msg);

const schema = z
  .object({
    employeeId: z.string().min(1, 'Select an employee'),
    amount: amount('Enter the advance amount'),
    installment: amount('Enter the monthly deduction'),
    mode: z.string().min(1),
    reference: z.string().max(60),
    note: z.string().max(300),
  })
  .refine(
    (v) => {
      try {
        return toPaise(v.installment) <= toPaise(v.amount);
      } catch {
        return true;
      }
    },
    { path: ['installment'], message: 'Cannot be more than the advance' },
  );

const money = { slotProps: { input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } } };

/** Give a salary advance. Pass `employee` to fix the employee (from their page). */
export default function AdvanceDrawer({ open, employee, onClose }) {
  const [create, state] = useCreateAdvanceMutation();
  const { data: staff } = useEmployeeListQuery({ status: 'active', limit: 100 }, { skip: !open || Boolean(employee) });
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(schema), defaultValues: { employeeId: '', amount: '', installment: '', mode: 'cash', reference: '', note: '' } });
  const [amt, inst] = useWatch({ control, name: ['amount', 'installment'] });

  useEffect(() => {
    if (open) reset({ employeeId: employee?.id ?? '', amount: '', installment: '', mode: 'cash', reference: '', note: '' });
  }, [open, employee, reset]);

  let months = null;
  try {
    const a = toPaise(amt);
    const i = toPaise(inst);
    if (a > 0 && i > 0 && i <= a) months = Math.ceil(a / i);
  } catch {
    months = null;
  }

  const onSubmit = handleSubmit(async (v) => {
    try {
      const adv = await create({ employeeId: v.employeeId, amountPaise: toPaise(v.amount), installmentPaise: toPaise(v.installment), mode: v.mode, reference: v.reference || null, note: v.note || null }).unwrap();
      toast.success(`Advance ${adv.advanceNo} of ${formatINR(adv.amountPaise, { decimals: 0 })} given to ${adv.employee.name}`);
      onClose();
    } catch (err) {
      if (!applyServerErrors(remapErrors(err, { amountPaise: 'amount', installmentPaise: 'installment' }), setError)) toast.error(getErrorMessage(err));
    }
  });

  return (
    <FormDrawer
      open={open}
      title="Give salary advance"
      subtitle={employee ? `${employee.name} · ${employee.code}` : 'Recovered from salary in monthly instalments.'}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={state.isLoading}
      submitLabel="Give advance"
    >
      <Grid container spacing={2}>
        {!employee && (
          <Grid size={12}>
            <RHFSelect control={control} name="employeeId" label="Employee" placeholder="Select employee" options={(staff?.items ?? []).map((e) => ({ value: e.id, label: `${e.name} · ${e.code} · ${e.designation}` }))} />
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="amount" label="Advance amount" autoFocus {...money} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="installment" label="Deduct each month" {...money} />
        </Grid>
        {months && (
          <Grid size={12}>
            <Alert severity="info" icon={false}>
              Recovered over about <strong>{months} month{months > 1 ? 's' : ''}</strong> of salary. You can change the deduction in each month’s payroll.
            </Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFSelect control={control} name="mode" label="Paid by" options={PAY_MODES} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="reference" label="Reference (optional)" helperText="UPI / transfer ref." />
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name="note" label="Reason (optional)" multiline minRows={2} />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
