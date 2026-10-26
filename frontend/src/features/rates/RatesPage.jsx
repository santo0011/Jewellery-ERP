import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TollOutlinedIcon from '@mui/icons-material/TollOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import { useCurrentRatesQuery, useRateHistoryQuery, useSetRatesMutation } from './rateApi.js';
import { t } from '../../i18n/index.js';

const metalName = (m) => METAL_OPTIONS.find((o) => o.value === m)?.label ?? m;
/** Card icon and accent per metal (the dashboard's summary-card tones). */
const METAL_LOOK = {
  gold: { icon: DiamondOutlinedIcon, tone: 'gold' },
  silver: { icon: TollOutlinedIcon, tone: 'grey' },
  platinum: { icon: AutoAwesomeOutlinedIcon, tone: 'blue' },
};
// Show "All metals" when no metal is picked, instead of an empty box.
const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

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
        nextErrors[s.key] = t('Enter a valid rate');
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!rates.length) {
      toast.error(t('Enter at least one rate'));
      return;
    }
    try {
      await setRates({ rates, note: note || undefined }).unwrap();
      toast.success((rates.length === 1 ? t('{{count}} rate updated', { count: rates.length }) : t('{{count}} rates updated', { count: rates.length })));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={submit}>
        <DialogTitle sx={{ fontWeight: 600 }}>{t('Update today\'s rates')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {t('Rate per gram. Earlier rates stay in history, and invoices already issued keep the rate they used.')}
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
                  slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, endAdornment: <InputAdornment position="end">{t('/g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                />
              </Grid>
            ))}
            <Grid size={12}>
              <TextField label={t('Source / note')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. IBJA morning rate')} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={isLoading}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            {t('Save rates')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default function RatesPage() {
  const { data: session } = useSession();
  // One set of rates for the whole organisation: updated at organisation level, used by every branch.
  const canUpdate = usePermission('rate.create') && Boolean(session?.user?.allBranches);
  const [open, setOpen] = useState(false);
  const { data: current = [], isLoading, error, refetch } = useCurrentRatesQuery();
  const list = useListParams({ metal: '' });
  const history = useRateHistoryQuery(list.params);
  const stale = current.length > 0 && current.some((r) => !r.isToday);

  const columns = [
    { key: 'when', label: t('Effective'), render: (r) => formatDateTime(r.effectiveAt) },
    { key: 'metal', label: t('Metal'), render: (r) => `${metalName(r.metal)} ${purityLabel(r.metal, r.purity)}` },
    { key: 'rate', label: t('Rate / g'), align: 'right', render: (r) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatINR(r.ratePerGramPaise)}</Typography> },
    { key: 'by', label: t('Updated by'), render: (r) => r.createdBy?.name },
    { key: 'note', label: t('Note'), render: (r) => (r.withdrawn ? <Chip size="small" variant="outlined" label={t('Withdrawn (undone)')} sx={{ height: 22 }} /> : (r.note ?? '—')) },
  ];

  return (
    <>
      <PageHeader
        title={t('Metal rates')}
        subtitle={t('One set of daily rates per gram for the whole organisation — every branch bills with them. History is never overwritten.')}
        actions={
          canUpdate && (
            <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => setOpen(true)}>
              {t('Update rates')}
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
              {canUpdate ? t('No rates entered yet. Enter today\'s rates before billing.') : t('No rates entered yet. The organisation enters the rates once for all branches.')}
            </Alert>
          ) : (
            stale && (
              <Alert severity="warning" icon={<WarningAmberRoundedIcon />} sx={{ mb: 3 }}>
                {(canUpdate ? t('Some rates were not updated today.') : t('Some rates were not updated today. The organisation updates them for all branches.'))}
              </Alert>
            )
          )}
          {/* One dashboard-style card per rate; a rate not updated today turns amber. */}
          {current.length > 0 && (
            <SummaryCards>
              {current.map((r) => (
                <SummaryCard
                  key={`${r.metal}:${r.purity}`}
                  icon={METAL_LOOK[r.metal]?.icon ?? DiamondOutlinedIcon}
                  tone={r.isToday ? (METAL_LOOK[r.metal]?.tone ?? 'gold') : 'amber'}
                  label={`${metalName(r.metal)} · ${purityLabel(r.metal, r.purity)}`}
                  value={t('{{ratePerGram}} /g', { ratePerGram: formatINR(r.ratePerGramPaise, { decimals: 0 }) })}
                  caption={r.isToday ? t('Updated {{at}}', { at: formatDateTime(r.effectiveAt) }) : t('Not updated today · {{at}}', { at: formatDateTime(r.effectiveAt) })}
                />
              ))}
            </SummaryCards>
          )}
        </>
      )}

      <Typography variant="h4" sx={{ mb: 1.5 }}>
        {t('Rate history')}
      </Typography>
      <DataTable
        columns={columns}
        rows={history.data?.items}
        loading={history.isLoading}
        fetching={history.isFetching}
        error={history.error}
        onRetry={history.refetch}
        empty={{ title: t('No rate history yet') }}
        pagination={list.pagination(history.data?.meta)}
        toolbar={
          <Stack direction="row" spacing={1.5}>
            <TextField select label={t('Metal')} value={list.filters.metal} onChange={(e) => list.setFilter('metal', e.target.value)} slotProps={filterSlots} sx={{ width: { xs: '100%', sm: 180 } }}>
              <MenuItem value="">{t('All metals')}</MenuItem>
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
