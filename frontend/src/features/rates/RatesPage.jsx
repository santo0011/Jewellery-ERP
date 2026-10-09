import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { formatINR, fromPaise, METAL_OPTIONS, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import { useCurrentRatesQuery, useRateHistoryQuery, useSetRatesMutation } from './rateApi.js';

const metalName = (m) => METAL_OPTIONS.find((o) => o.value === m)?.label ?? m;

function enabledSlots(catalog) {
  return METAL_OPTIONS.flatMap((m) => (catalog.enabledPurities[m.value] ?? []).map((purity) => ({ metal: m.value, purity, key: `${m.value}:${purity}` })));
}

function UpdateRatesDialog({ open, onClose, current, catalog }) {
  const slots = enabledSlots(catalog);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [note, setNote] = useState('');
  const [setRates, { isLoading }] = useSetRatesMutation();

  useEffect(() => {
    if (!open) return;
    setValues(Object.fromEntries(slots.map((s) => [s.key, String(fromPaise(current.find((r) => r.metal === s.metal && r.purity === s.purity)?.ratePerGramPaise) ?? '')])));
    setErrors({});
    setNote('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    const rates = [];
    for (const s of slots) {
      const raw = values[s.key]?.trim();
      if (!raw) continue;
      try {
        const paise = toPaise(raw);
        if (!paise || paise < 100) throw new Error();
        rates.push({ metal: s.metal, purity: s.purity, ratePerGramPaise: paise });
      } catch {
        nextErrors[s.key] = 'Enter a valid rate';
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!rates.length) {
      toast.error('Enter at least one rate');
      return;
    }
    try {
      await setRates({ rates, note: note || undefined }).unwrap();
      toast.success(`${rates.length} rate${rates.length === 1 ? '' : 's'} updated`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={submit}>
        <DialogTitle sx={{ fontWeight: 600 }}>Update today's rates</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Rate per gram. Earlier rates stay in history, and invoices already issued keep the rate they used.
          </Typography>
          <Grid container spacing={2}>
            {slots.map((s) => (
              <Grid key={s.key} size={{ xs: 12, sm: 6 }}>
                <TextField
                  label={`${metalName(s.metal)} ${purityLabel(s.metal, s.purity)}`}
                  value={values[s.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                  error={Boolean(errors[s.key])}
                  helperText={errors[s.key]}
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, endAdornment: <InputAdornment position="end">/g</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                />
              </Grid>
            ))}
            <Grid size={12}>
              <TextField label="Source / note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. IBJA morning rate" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            Save rates
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default function RatesPage() {
  const { data: session } = useSession();
  const canUpdate = usePermission('rate.create');
  const [open, setOpen] = useState(false);
  const { data: current = [], isLoading, error, refetch } = useCurrentRatesQuery();
  const list = useListParams({ metal: '' });
  const history = useRateHistoryQuery(list.params);
  const stale = current.length > 0 && current.some((r) => !r.isToday);

  const columns = [
    { key: 'when', label: 'Effective', render: (r) => formatDateTime(r.effectiveAt) },
    { key: 'metal', label: 'Metal', render: (r) => `${metalName(r.metal)} ${purityLabel(r.metal, r.purity)}` },
    { key: 'rate', label: 'Rate / g', align: 'right', render: (r) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatINR(r.ratePerGramPaise)}</Typography> },
    { key: 'by', label: 'Updated by', render: (r) => r.createdBy?.name },
    { key: 'note', label: 'Note', render: (r) => r.note ?? '—' },
  ];

  return (
    <>
      <PageHeader
        title="Metal rates"
        subtitle="Daily rates per gram used for pricing. History is never overwritten."
        actions={
          canUpdate && (
            <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => setOpen(true)}>
              Update rates
            </Button>
          )
        }
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <>
          {current.length === 0 ? (
            <Alert severity="warning" sx={{ mb: 3 }}>
              No rates entered yet. Enter today's rates before billing.
            </Alert>
          ) : (
            stale && (
              <Alert severity="warning" icon={<WarningAmberRoundedIcon />} sx={{ mb: 3 }}>
                Some rates were not updated today.
              </Alert>
            )
          )}
          <Grid container spacing={2} sx={{ mb: 4 }}>
            {current.map((r) => (
              <Grid key={`${r.metal}:${r.purity}`} size={{ xs: 6, md: 4, lg: 3 }}>
                <Card sx={{ height: '100%', borderTop: 3, borderTopColor: r.metal === 'gold' ? 'primary.main' : 'divider' }}>
                  <CardContent>
                    <Typography variant="overline" color="textSecondary">
                      {metalName(r.metal)} · {purityLabel(r.metal, r.purity)}
                    </Typography>
                    <Typography variant="h2" component="p" sx={{ mt: 0.5, fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
                      {formatINR(r.ratePerGramPaise, { decimals: 0 })}
                      <Typography component="span" variant="body2" color="textSecondary">
                        {' '}
                        /g
                      </Typography>
                    </Typography>
                    <Typography variant="caption" color={r.isToday ? 'textSecondary' : 'warning'}>
                      {r.isToday ? 'Updated' : 'Last updated'} {formatDateTime(r.effectiveAt)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      <Typography variant="h4" sx={{ mb: 1.5 }}>
        Rate history
      </Typography>
      <DataTable
        columns={columns}
        rows={history.data?.items}
        loading={history.isLoading}
        fetching={history.isFetching}
        error={history.error}
        onRetry={history.refetch}
        empty={{ title: 'No rate history yet' }}
        pagination={list.pagination(history.data?.meta)}
        toolbar={
          <Stack direction="row" spacing={1.5}>
            <TextField select label="Metal" value={list.filters.metal} onChange={(e) => list.setFilter('metal', e.target.value)} sx={{ maxWidth: 180 }}>
              <MenuItem value="">All metals</MenuItem>
              {METAL_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        }
      />
      <UpdateRatesDialog open={open} onClose={() => setOpen(false)} current={current} catalog={session.catalog} />
      <Box sx={{ height: 8 }} />
    </>
  );
}
