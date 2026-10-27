import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, IconButton, InputAdornment, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { formatINR, formatWeight, METAL_OPTIONS, PURITIES, toBps, toMg, toPaise, valueOldGold } from '@jerp/shared';
import { useCurrentRatesQuery } from '../rates/rateApi.js';
import { t } from '../../i18n/index.js';

/*
 * Old gold pieces as the counter enters them: description, tested purity, weights (grams), the rate offered (₹/g) and
 * the melting-loss deduction (%). Values preview with the shared formula; the server recomputes them.
 */

const safe = (fn, v) => {
  try {
    return v === '' || v == null ? 0 : fn(v);
  } catch {
    return NaN;
  }
};
const numeric = (v) => v.replace(/[^\d.]/g, '');
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// Every metal and purity the shop can test to, e.g. "Gold 22K (916)".
const PURITY_CHOICES = METAL_OPTIONS.flatMap((m) =>
  (PURITIES[m.value] ?? []).map((p) => ({ value: `${m.value}:${p.fineness}`, metal: m.value, purity: p.fineness, label: p.label.toLowerCase().includes(m.label.toLowerCase()) ? p.label : `${m.label} ${p.label}` })),
);

export const emptyOldGoldRow = () => ({ key: newKey(), description: '', choice: 'gold:916', gross: '', less: '', rate: '', deduction: '', rateTouched: false });

/** A row as the API wants it, with its preview value; `errors` says what is wrong in each field, `error` the first. */
export function readOldGoldRow(row) {
  const { metal, purity } = PURITY_CHOICES.find((c) => c.value === row.choice) ?? {};
  const line = {
    description: row.description.trim(),
    metal,
    purity,
    grossWeightMg: safe(toMg, row.gross),
    lessWeightMg: safe(toMg, row.less),
    ratePerGramPaise: safe(toPaise, row.rate),
    deductionBps: safe(toBps, row.deduction),
  };
  const errors = {};
  if (line.description.length < 2) errors.description = t('Describe the piece');
  if (!(line.grossWeightMg > 0)) errors.gross = t('Enter the weight');
  else if (!(line.lessWeightMg >= 0) || line.lessWeightMg >= line.grossWeightMg) errors.less = t('Less weight must be below the weight');
  if (!(line.ratePerGramPaise > 0)) errors.rate = t('Enter the rate');
  if (!(line.deductionBps >= 0) || line.deductionBps > 5000) errors.deduction = t('Deduction can be 0–50%');
  const error = Object.values(errors)[0] ?? null;
  return { line, errors, error, value: error ? null : valueOldGold(line) };
}

/** Rows ready to send, or null while any row is incomplete. Empty rows are ignored. */
export function oldGoldPayload(rows) {
  const filled = rows.filter((r) => r.description || r.gross || r.rate);
  const read = filled.map(readOldGoldRow);
  return read.some((r) => r.error) ? null : read.map((r) => r.line);
}

export const oldGoldTotal = (rows) => rows.map(readOldGoldRow).reduce((s, r) => s + (r.value?.valuePaise ?? 0), 0);

export default function OldGoldLinesEditor({ rows, onChange, dense = false }) {
  const { data: rates = [] } = useCurrentRatesQuery();
  const todayRate = (choice) => {
    const c = PURITY_CHOICES.find((x) => x.value === choice);
    const r = c && rates.find((x) => x.metal === c.metal && x.purity === c.purity);
    return r ? String(r.ratePerGramPaise / 100) : '';
  };
  const update = (key, patch) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => onChange([...rows, { ...emptyOldGoldRow(), rate: todayRate('gold:916') }]);

  return (
    <Stack spacing={1.5}>
      {rows.map((row, n) => {
        const { errors, error, value } = readOldGoldRow(row);
        const started = row.description || row.gross || row.rate;
        // Once a piece is started, each field with a problem is outlined red with its own message.
        const fieldError = (name) => (started && errors[name] ? { error: true, helperText: errors[name] } : {});
        return (
          <Box key={row.key} sx={{ p: dense ? 1.5 : 2, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignItems: { sm: 'flex-start' } }}>
              <TextField size="small" label={t('Piece {{value}}', { value: n + 1 })} placeholder={t('e.g. Old bangle')} value={row.description} onChange={(e) => update(row.key, { description: e.target.value })} {...fieldError('description')} sx={{ flex: 1 }} slotProps={{ htmlInput: { maxLength: 80 } }} />
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <TextField
                  select
                  size="small"
                  label={t('Tested purity')}
                  value={row.choice}
                  onChange={(e) => update(row.key, { choice: e.target.value, ...(!row.rateTouched && { rate: todayRate(e.target.value) }) })}
                  sx={{ width: { xs: '100%', sm: 190 } }}
                >
                  {PURITY_CHOICES.map((c) => (
                    <MenuItem key={c.value} value={c.value}>
                      {c.label}
                    </MenuItem>
                  ))}
                </TextField>
                <Tooltip title={t('Remove piece')}>
                  <IconButton size="small" onClick={() => onChange(rows.filter((r) => r.key !== row.key))} aria-label={t('Remove piece {{value}}', { value: n + 1 })} sx={{ mt: 0.5 }}>
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
            <Box sx={{ mt: 1.25, display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' } }}>
              <TextField size="small" label={t('Weight')} value={row.gross} onChange={(e) => update(row.key, { gross: numeric(e.target.value) })} {...fieldError('gross')} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
              <TextField size="small" label={t('Less (stones)')} value={row.less} onChange={(e) => update(row.key, { less: numeric(e.target.value) })} {...fieldError('less')} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
              <TextField
                size="small"
                label={t('Rate')}
                value={row.rate}
                onChange={(e) => update(row.key, { rate: numeric(e.target.value), rateTouched: true })}
                {...fieldError('rate')}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, endAdornment: <InputAdornment position="end">{t('/g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
              />
              <TextField size="small" label={t('Deduction')} value={row.deduction} onChange={(e) => update(row.key, { deduction: numeric(e.target.value) })} {...fieldError('deduction')} slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
            </Box>
            <Stack direction="row" sx={{ mt: 1, justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 1 }}>
              {/* Problems show on their fields; this line shows the result (or the hint before anything is typed). */}
              <Typography variant="caption" color={started && error ? 'error.main' : 'textSecondary'}>
                {started && error ? t('Fix the fields marked in red') : value ? (value.deductionPaise ? t('Net {{netWeight}} · fine {{fineWeight}} · less {{deduction}}', { netWeight: formatWeight(value.netWeightMg), fineWeight: formatWeight(value.fineWeightMg), deduction: formatINR(value.deductionPaise, { decimals: 0 }) }) : t('Net {{netWeight}} · fine {{fineWeight}}', { netWeight: formatWeight(value.netWeightMg), fineWeight: formatWeight(value.fineWeightMg) })) : t('Rate starts at today’s selling rate; change it to what you offer.')}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {value ? formatINR(value.valuePaise) : '—'}
              </Typography>
            </Stack>
          </Box>
        );
      })}
      <Button size="small" startIcon={<AddRoundedIcon />} onClick={add} sx={{ alignSelf: 'flex-start' }}>
        {rows.length ? t('Add another piece') : t('Add old gold')}
      </Button>
    </Stack>
  );
}
