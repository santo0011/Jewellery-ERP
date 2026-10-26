import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, Grid, IconButton, InputAdornment, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { decimalToScaledInt, fineWeightMg, formatINR, formatWeight, METAL_OPTIONS, PURITIES, toPaise } from '@jerp/shared';
import { useCurrentRatesQuery } from '../rates/rateApi.js';
import { t } from '../../i18n/index.js';

/**
 * The customer's own gold (or silver) handed over for an order: weight, purity and anything taken off (dirt, stones).
 * It is valued at today's rate for that purity and counts as part of the advance.
 */
export const emptyGoldLine = () => ({ description: '', metal: 'gold', purity: 916, weight: '', less: '', rate: '' });

const mg = (v) => {
  try {
    return v ? (decimalToScaledInt(v, 3) ?? null) : 0;
  } catch {
    return null;
  }
};
const paise = (v) => {
  try {
    return v ? (toPaise(v) ?? null) : 0;
  } catch {
    return null;
  }
};
const num = (v) => v.replace(/[^\d.]/g, '');

/** Lines → request body (`customerMetal`), with any errors by `index.field`. */
export function goldLinesToPayload(lines) {
  const errors = {};
  const payload = lines.map((l, i) => {
    const grossWeightMg = mg(l.weight);
    const lessWeightMg = mg(l.less);
    const ratePerGramPaise = paise(l.rate);
    if (!grossWeightMg) errors[`${i}.weight`] = t('Enter weight');
    if (lessWeightMg === null || (grossWeightMg && lessWeightMg >= grossWeightMg)) errors[`${i}.less`] = t('Less than the weight');
    if (ratePerGramPaise === null) errors[`${i}.rate`] = t('Enter a valid amount');
    return { description: l.description.trim() || null, metal: l.metal, purity: Number(l.purity), grossWeightMg, lessWeightMg: lessWeightMg ?? 0, ...(ratePerGramPaise && { ratePerGramPaise }) };
  });
  return { payload, errors };
}

/** Today's rate per gram for the line's metal and purity, unless typed in. */
const rateFor = (l, rates) => paise(l.rate) || rates?.find((r) => r.metal === l.metal && r.purity === Number(l.purity))?.ratePerGramPaise || null;

/** What the lines are worth together (shown as part of the advance). */
export function goldLinesValue(lines, rates) {
  return lines.reduce((n, l) => {
    const net = (mg(l.weight) ?? 0) - (mg(l.less) ?? 0);
    const rate = rateFor(l, rates);
    return n + (net > 0 && rate ? Math.round((net * rate) / 1000) : 0);
  }, 0);
}

export default function CustomerGoldEditor({ lines, onChange, errors = {} }) {
  const { data: rates } = useCurrentRatesQuery();
  const update = (i, patch) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Box>
      {lines.map((l, i) => {
        const net = (mg(l.weight) ?? 0) - (mg(l.less) ?? 0);
        const rate = rateFor(l, rates);
        const noRate = !rate && net > 0;
        // Two fields a row whatever the screen: this sits in narrow places (the order form's side panel).
        return (
          <Paper key={i} variant="outlined" sx={{ p: 1.5, mb: 1.25, borderRadius: 2.5 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
                {t('Gold {{value}}', { value: i + 1 })}
              </Typography>
              <IconButton size="small" onClick={() => onChange(lines.filter((_, j) => j !== i))} aria-label={t('Remove')} sx={{ mr: -0.5 }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
            <Grid container spacing={1.25} sx={{ alignItems: 'flex-start' }}>
              <Grid size={12}>
                <TextField size="small" label={t('What is it')} placeholder={t('e.g. Old bangle')} value={l.description} onChange={(e) => update(i, { description: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
              </Grid>
              <Grid size={6}>
                <TextField size="small" select label={t('Metal')} value={l.metal} onChange={(e) => update(i, { metal: e.target.value, purity: PURITIES[e.target.value][0].fineness })}>
                  {METAL_OPTIONS.map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      {m.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField size="small" select label={t('Purity')} value={l.purity} onChange={(e) => update(i, { purity: e.target.value })}>
                  {(PURITIES[l.metal] ?? []).map((p) => (
                    <MenuItem key={p.fineness} value={p.fineness}>
                      {p.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField size="small" label={t('Weight')} value={l.weight} onChange={(e) => update(i, { weight: num(e.target.value) })} error={Boolean(errors[`${i}.weight`])} helperText={errors[`${i}.weight`]} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
              </Grid>
              <Grid size={6}>
                <TextField size="small" label={t('Less')} value={l.less} placeholder="0" onChange={(e) => update(i, { less: num(e.target.value) })} error={Boolean(errors[`${i}.less`])} helperText={errors[`${i}.less`] ?? t('Dirt, stones')} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
              </Grid>
              {/* No rate saved today for this purity: it has to be typed in. */}
              {(noRate || l.rate) && (
                <Grid size={12}>
                  <TextField size="small" label={t('Rate per gram')} value={l.rate} onChange={(e) => update(i, { rate: num(e.target.value) })} error={Boolean(errors[`${i}.rate`]) || noRate} helperText={errors[`${i}.rate`] ?? (noRate ? t('No rate today for this purity — enter it') : ' ')} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
                </Grid>
              )}
            </Grid>
            {net > 0 && (
              // What it comes to: net and fine weight, and its value counted in the advance.
              <Stack direction="row" sx={{ mt: 1.25, px: 1.25, py: 1, borderRadius: 1.5, bgcolor: 'rgba(var(--brand-rgb), 0.08)', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="textSecondary">
                  {t('Net {{net}} · fine {{fine}}', { net: formatWeight(net), fine: formatWeight(fineWeightMg(net, Number(l.purity))) })}
                  {rate ? ` · ${formatINR(rate, { decimals: 0 })}/g` : ''}
                </Typography>
                {rate ? (
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--brand-strong)' }}>
                    {formatINR(Math.round((net * rate) / 1000), { decimals: 0 })}
                  </Typography>
                ) : null}
              </Stack>
            )}
          </Paper>
        );
      })}
      <Button size="small" variant={lines.length ? 'text' : 'outlined'} startIcon={<AddRoundedIcon />} onClick={() => onChange([...lines, emptyGoldLine()])}>
        {lines.length ? t('Add more gold') : t('Customer gave gold')}
      </Button>
    </Box>
  );
}
