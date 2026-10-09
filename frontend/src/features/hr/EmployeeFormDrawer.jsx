import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Grid, InputAdornment, Typography } from '@mui/material';
import { formatINR, fromPaise, toPaise } from '@jerp/shared';
import { employeeSchema } from '@jerp/shared/schemas';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { PhotoPicker } from './EmployeePhoto.jsx';
import { useCreateEmployeeMutation, useRemoveEmployeePhotoMutation, useSetEmployeePhotoMutation, useUpdateEmployeeMutation } from './hrApi.js';
import { remapErrors, todayIso } from './hrUi.jsx';

const rupees = (label, { required } = {}) =>
  z.string().refine((v) => {
    if (!v) return !required;
    try {
      const p = toPaise(v);
      return p !== null && p >= (required ? 1 : 0);
    } catch {
      return false;
    }
  }, required ? `Enter the ${label}` : 'Enter a valid amount');

const formSchema = employeeSchema.omit({ basicPaise: true, allowancePaise: true }).extend({ basic: rupees('basic salary', { required: true }), allowance: rupees('allowance') });

const EMPTY = { name: '', mobile: '', email: '', designation: '', branchId: '', joiningDate: todayIso(), basic: '', allowance: '', pan: '', bank: { accountName: '', accountNumber: '', ifsc: '' }, address: '', notes: '' };
const blank = (v) => v ?? '';
const toForm = (e, branchId) =>
  e
    ? {
        name: e.name,
        mobile: e.mobile,
        email: blank(e.email),
        designation: e.designation,
        branchId: e.branch.id,
        joiningDate: e.joiningDate,
        basic: String(fromPaise(e.basicPaise ?? 0)),
        allowance: e.allowancePaise ? String(fromPaise(e.allowancePaise)) : '',
        pan: blank(e.pan),
        bank: { accountName: blank(e.bank?.accountName), accountNumber: blank(e.bank?.accountNumber), ifsc: blank(e.bank?.ifsc) },
        address: blank(e.address),
        notes: blank(e.notes),
      }
    : { ...EMPTY, branchId };

const money = { slotProps: { input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } } };
const upper = (v) => v.toUpperCase();

export default function EmployeeFormDrawer({ open, employee, onClose }) {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const editing = Boolean(employee);
  const [create, createState] = useCreateEmployeeMutation();
  const [update, updateState] = useUpdateEmployeeMutation();
  const [setPhoto, setPhotoState] = useSetEmployeePhotoMutation();
  const [removePhoto, removePhotoState] = useRemoveEmployeePhotoMutation();
  const [photo, setPhotoFile] = useState(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const [basic, allowance, name] = useWatch({ control, name: ['basic', 'allowance', 'name'] });
  const error = editing ? updateState.error : createState.error;

  useEffect(() => {
    if (open) {
      reset(toForm(employee, session.branches[0]?.id ?? ''));
      setPhotoFile(null);
      setPhotoRemoved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, employee, reset]);

  let gross = null;
  try {
    gross = (toPaise(basic || '0') ?? 0) + (toPaise(allowance || '0') ?? 0);
  } catch {
    gross = null;
  }

  // The photo is uploaded after the employee is saved; a failed upload keeps the saved details and says so.
  const savePhoto = async (id) => {
    try {
      if (photo) await setPhoto({ id, file: photo }).unwrap();
      else if (photoRemoved) await removePhoto(id).unwrap();
    } catch (err) {
      toast.error(`Saved, but the photo was not: ${getErrorMessage(err)}`);
    }
  };

  const onSubmit = handleSubmit(async ({ basic: b, allowance: a, ...values }) => {
    const payload = { ...values, basicPaise: toPaise(b), allowancePaise: a ? toPaise(a) : 0 };
    try {
      if (editing) {
        await update({ id: employee.id, ...payload }).unwrap();
        await savePhoto(employee.id);
        toast.success('Employee updated');
        onClose();
      } else {
        const created = await create(payload).unwrap();
        await savePhoto(created.id);
        toast.success(`${created.name} added as ${created.code}`);
        onClose();
        navigate(`/hr/employees/${created.id}`);
      }
    } catch (err) {
      if (!applyServerErrors(remapErrors(err, { basicPaise: 'basic', allowancePaise: 'allowance' }), setError)) toast.error(getErrorMessage(err));
    }
  });

  const section = (title) => (
    <Grid size={12}>
      <Typography variant="overline" color="textSecondary">
        {title}
      </Typography>
    </Grid>
  );

  return (
    <FormDrawer
      open={open}
      title={editing ? 'Edit employee' : 'New employee'}
      subtitle={editing ? `${employee.name} · ${employee.code}` : 'Staff on the payroll of one branch.'}
      onClose={onClose}
      onSubmit={onSubmit}
      submitting={createState.isLoading || updateState.isLoading || setPhotoState.isLoading || removePhotoState.isLoading}
      submitLabel={editing ? 'Save changes' : 'Add employee'}
      width={600}
    >
      <Grid container spacing={2}>
        {error && !error.data?.error?.details && (
          <Grid size={12}>
            <Alert severity="error">{getErrorMessage(error)}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <PhotoPicker employee={employee} name={name} file={photo} onChange={setPhotoFile} removed={photoRemoved} onRemove={() => setPhotoRemoved(true)} />
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name="name" label="Full name" autoFocus={!editing} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="mobile" label="Mobile" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 10 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="email" label="Email (optional)" type="email" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="designation" label="Designation" helperText="e.g. Salesman, Cashier, Polisher" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFSelect control={control} name="branchId" label="Branch" options={session.branches.map((b) => ({ value: b.id, label: b.name }))} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="joiningDate" label="Joining date" type="date" slotProps={{ inputLabel: { shrink: true } }} />
        </Grid>

        {section('Monthly salary')}
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="basic" label="Basic salary" {...money} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <RHFTextField control={control} name="allowance" label="Allowance (optional)" helperText="Travel, food, etc. — paid with salary" {...money} />
        </Grid>
        {gross > 0 && (
          <Grid size={12}>
            <Alert severity="info" icon={false}>
              Gross monthly salary <strong>{formatINR(gross, { decimals: 0 })}</strong>. Absent days are cut pro-rata; a half day is cut by half.
            </Alert>
          </Grid>
        )}

        <Grid size={12}>
          <MoreDetails hint="Bank account, PAN, address, notes" defaultOpen={Boolean(employee && (employee.bank?.accountNumber || employee.pan || employee.address || employee.notes))}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bank.accountName" label="Account holder" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bank.accountNumber" label="Account number" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 20 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="bank.ifsc" label="IFSC" transform={upper} slotProps={{ htmlInput: { maxLength: 11 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RHFTextField control={control} name="pan" label="PAN" transform={upper} slotProps={{ htmlInput: { maxLength: 10 } }} />
              </Grid>

              <Grid size={12}>
                <RHFTextField control={control} name="address" label="Address" multiline minRows={2} />
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
