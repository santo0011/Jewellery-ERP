import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Alert, Box, Button, ButtonBase, Grid, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { EXPENSE_PAY_MODES, formatINR, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import FormDrawer from '../../components/FormDrawer.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCreateExpenseCategoryMutation, useCreateExpenseMutation, useExpenseCategoriesQuery, useUpdateExpenseMutation } from './financeApi.js';

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const paiseOf = (v) => {
  try {
    return v ? toPaise(v) : 0;
  } catch {
    return null;
  }
};
const EMPTY = { categoryId: '', amount: '', date: todayIso(), mode: 'cash', reference: '', note: '', reason: '' };

/** Category picker: the heads as chips (most used first), with "+ New" to add one on the spot. */
function CategoryChips({ categories, value, onChange, error }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [create, { isLoading }] = useCreateExpenseCategoryMutation();
  const add = async () => {
    try {
      const cat = await create({ name: name.trim() }).unwrap();
      onChange(cat.id);
      setName('');
      setAdding(false);
      toast.success(`${cat.name} added`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  const list = [...categories].filter((c) => c.status === 'active').sort((a, b) => b.used - a.used || a.name.localeCompare(b.name));
  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 600, color: error ? 'error.main' : 'text.secondary', display: 'block', mb: 0.75 }}>
        Category{error ? ` — ${error}` : ''}
      </Typography>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {list.map((c) => {
          const on = c.id === value;
          return (
            <ButtonBase
              key={c.id}
              onClick={() => onChange(c.id)}
              aria-pressed={on}
              sx={{ px: 1.5, py: 0.75, borderRadius: 999, border: 1, fontSize: '0.8125rem', fontWeight: on ? 700 : 500, transition: 'all 140ms', ...(on ? { borderColor: 'var(--brand)', bgcolor: 'rgba(var(--brand-rgb), 0.14)', color: 'var(--brand-strong)' } : { borderColor: 'divider', color: 'text.primary', '&:hover': { borderColor: 'rgba(var(--brand-rgb), 0.5)' } }) }}
            >
              {c.name}
            </ButtonBase>
          );
        })}
        {!adding && (
          <ButtonBase onClick={() => setAdding(true)} sx={{ px: 1.25, py: 0.75, gap: 0.25, borderRadius: 999, border: '1px dashed', borderColor: 'rgba(var(--brand-rgb), 0.5)', color: 'var(--brand-strong)', fontSize: '0.8125rem', fontWeight: 600 }}>
            <AddRoundedIcon sx={{ fontSize: 16 }} />
            New
          </ButtonBase>
        )}
      </Stack>
      {adding && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
          <TextField size="small" autoFocus label="New category" placeholder="e.g. Security guard" value={name} onChange={(e) => setName(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} onKeyDown={(e) => e.key === 'Enter' && name.trim().length >= 2 && (e.preventDefault(), add())} />
          <Button variant="outlined" color="secondary" onClick={add} disabled={name.trim().length < 2} loading={isLoading} sx={{ flexShrink: 0 }}>
            Add
          </Button>
          <Button onClick={() => setAdding(false)} sx={{ flexShrink: 0 }}>
            Cancel
          </Button>
        </Stack>
      )}
    </Box>
  );
}

/** Add an expense, or correct one (with a reason, kept in its history). Salary is not entered here — Payroll books it. */
export default function ExpenseFormDrawer({ open, expense, onClose }) {
  const editing = Boolean(expense);
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const branches = session?.branches ?? [];
  const { data: categories = [] } = useExpenseCategoriesQuery(undefined, { skip: !open });
  const [create, createState] = useCreateExpenseMutation();
  const [update, updateState] = useUpdateExpenseMutation();
  const [form, setForm] = useState(EMPTY);
  const [branchId, setBranchId] = useState('');
  const [errors, setErrors] = useState({});
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setBranchId(expense?.branch?.id ?? activeBranchId ?? branches[0]?.id ?? '');
    setForm(
      expense
        ? { categoryId: String(expense.category.id), amount: String(expense.amountPaise / 100), date: expense.date, mode: expense.mode, reference: expense.reference ?? '', note: expense.note ?? '', reason: '' }
        : { ...EMPTY, date: todayIso() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense]);

  const amountPaise = paiseOf(form.amount);
  const submit = async () => {
    const e = {};
    if (!form.categoryId) e.categoryId = 'pick one';
    if (amountPaise === null || amountPaise <= 0) e.amount = 'Enter the amount';
    if (!form.date) e.date = 'Pick the date';
    else if (form.date > todayIso()) e.date = 'Cannot be in the future';
    if (editing && form.reason.trim().length < 3) e.reason = 'Say why it is being changed';
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload = { categoryId: form.categoryId, date: form.date, amountPaise, mode: form.mode, reference: form.mode === 'cash' ? null : form.reference.trim() || null, note: form.note.trim() || null };
    try {
      if (editing) {
        await update({ id: expense.id, ...payload, reason: form.reason.trim() }).unwrap();
        toast.success('Expense corrected');
      } else {
        const saved = await create({ ...payload, branchId }).unwrap();
        toast.success(`${formatINR(saved.amountPaise, { decimals: 0 })} · ${saved.category.name} saved`);
      }
      onClose();
    } catch (err) {
      const d = err?.data?.error?.details?.[0];
      if (d?.path) setErrors({ [d.path === 'amountPaise' ? 'amount' : d.path]: d.message });
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer
      open={open}
      title={editing ? `Correct ${expense.expenseNo}` : 'Add expense'}
      subtitle={editing ? 'The books are corrected on the expense’s own date; the reason is kept.' : 'Paid today or earlier — shop costs only. Salary comes from Payroll.'}
      onClose={onClose}
      onSubmit={(ev) => {
        ev?.preventDefault?.();
        submit();
      }}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? 'Save correction' : 'Save expense'}
      width={520}
    >
      <Grid container spacing={2}>
        <Grid size={12}>
          <CategoryChips categories={categories} value={form.categoryId} onChange={set('categoryId')} error={errors.categoryId} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            label="Amount"
            value={form.amount}
            onChange={(e) => set('amount')(e.target.value.replace(/[^\d.]/g, ''))}
            error={Boolean(errors.amount)}
            helperText={errors.amount}
            autoFocus={!editing}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField label="Date" type="date" value={form.date} onChange={(e) => set('date')(e.target.value)} error={Boolean(errors.date)} helperText={errors.date} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIso() } }} />
        </Grid>
        <Grid size={12}>
          <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>
            Paid by
          </Typography>
          <ToggleButtonGroup exclusive fullWidth size="small" value={form.mode} onChange={(e, v) => v && set('mode')(v)}>
            {EXPENSE_PAY_MODES.map((m) => (
              <ToggleButton key={m.value} value={m.value}>
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Grid>
        {form.mode !== 'cash' && (
          <Grid size={12}>
            <TextField label="Reference (optional)" placeholder="UPI / bank / card ref." value={form.reference} onChange={(e) => set('reference')(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />
          </Grid>
        )}
        <Grid size={12}>
          <TextField label="Description (optional)" placeholder="e.g. Electricity bill for September" value={form.note} onChange={(e) => set('note')(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300 } }} />
        </Grid>
        {!editing && branches.length > 1 && (
          <Grid size={12}>
            <TextField select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}
        {editing && (
          <>
            <Grid size={12}>
              <TextField label="Reason for the change" value={form.reason} onChange={(e) => set('reason')(e.target.value)} error={Boolean(errors.reason)} helperText={errors.reason} slotProps={{ htmlInput: { maxLength: 200 } }} />
            </Grid>
            <Grid size={12}>
              <Alert severity="info" variant="outlined">
                The original entry is reversed and this one posted on {form.date || 'its date'}, so that month’s figures stay right.
              </Alert>
            </Grid>
          </>
        )}
      </Grid>
    </FormDrawer>
  );
}
