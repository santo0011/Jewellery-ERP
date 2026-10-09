import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Box, Button, Grid, IconButton, InputAdornment, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { decimalToScaledInt, fineWeightMg, formatWeight, METAL_OPTIONS, METAL_POOL_KINDS, PURITIES, toPaise } from '@jerp/shared';

export const emptyMetalLine = (direction = 'in') => ({ metal: 'gold', purity: 995, kind: 'bullion', direction, weight: '', value: '' });

const parseMg = (v) => {
  try {
    const mg = decimalToScaledInt(v, 3);
    return mg && mg > 0 ? mg : null;
  } catch {
    return null;
  }
};

export function metalLinesToPayload(lines, { includeValue }) {
  const errors = {};
  const payload = lines.map((l, i) => {
    const grossWeightMg = parseMg(l.weight);
    if (!grossWeightMg) errors[`${i}.weight`] = 'Enter weight';
    let valuePaise = 0;
    if (includeValue && l.value) {
      try {
        valuePaise = toPaise(l.value) ?? 0;
      } catch {
        errors[`${i}.value`] = 'Enter a valid amount';
      }
    }
    return { metal: l.metal, purity: Number(l.purity), kind: l.kind, direction: l.direction, grossWeightMg, valuePaise };
  });
  return { payload, errors };
}

export default function MetalLinesEditor({ lines, onChange, errors = {}, allowDirection = false, defaultDirection = 'in', showValue }) {
  const update = (i, patch) => onChange(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return (
    <Box>
      {lines.map((l, i) => {
        const mg = parseMg(l.weight);
        return (
          <Paper key={i} variant="outlined" sx={{ p: 2, mb: 1.5 }}>
            <Grid container spacing={1.5} sx={{ alignItems: 'flex-start' }}>
              {allowDirection && (
                <Grid size={{ xs: 12, sm: 3 }}>
                  <TextField select label="Direction" value={l.direction} onChange={(e) => update(i, { direction: e.target.value })}>
                    <MenuItem value="in">Add</MenuItem>
                    <MenuItem value="out">Remove</MenuItem>
                  </TextField>
                </Grid>
              )}
              <Grid size={{ xs: 6, sm: allowDirection ? 3 : 4 }}>
                <TextField select label="Metal" value={l.metal} onChange={(e) => update(i, { metal: e.target.value, purity: PURITIES[e.target.value][0].fineness })}>
                  {METAL_OPTIONS.map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      {m.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6, sm: allowDirection ? 3 : 4 }}>
                <TextField select label="Purity" value={l.purity} onChange={(e) => update(i, { purity: e.target.value })}>
                  {PURITIES[l.metal].map((p) => (
                    <MenuItem key={p.fineness} value={p.fineness}>
                      {p.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: allowDirection ? 3 : 4 }}>
                <TextField select label="Type" value={l.kind} onChange={(e) => update(i, { kind: e.target.value })}>
                  {METAL_POOL_KINDS.map((k) => (
                    <MenuItem key={k.value} value={k.value}>
                      {k.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: showValue ? 6 : 10, sm: showValue ? 5 : 10 }}>
                <TextField
                  label="Gross weight"
                  value={l.weight}
                  onChange={(e) => update(i, { weight: e.target.value.replace(/[^\d.]/g, '') })}
                  error={Boolean(errors[`${i}.weight`])}
                  helperText={errors[`${i}.weight`] ?? (mg ? `Fine ${formatWeight(fineWeightMg(mg, Number(l.purity)))}` : ' ')}
                  slotProps={{ input: { endAdornment: <InputAdornment position="end">g</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                />
              </Grid>
              {showValue && (
                <Grid size={{ xs: 6, sm: 5 }}>
                  <TextField
                    label="Value (optional)"
                    value={l.value}
                    onChange={(e) => update(i, { value: e.target.value.replace(/[^\d.]/g, '') })}
                    error={Boolean(errors[`${i}.value`])}
                    helperText={errors[`${i}.value`] ?? ' '}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                  />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: 2 }} sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.5 }}>
                <IconButton color="error" onClick={() => onChange(lines.filter((_, idx) => idx !== i))} aria-label="Remove metal line">
                  <DeleteOutlineRoundedIcon />
                </IconButton>
              </Grid>
            </Grid>
          </Paper>
        );
      })}
      {lines.length === 0 && (
        <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
          No metal lines.
        </Typography>
      )}
      <Button size="small" variant="outlined" color="secondary" startIcon={<AddRoundedIcon />} onClick={() => onChange([...lines, emptyMetalLine(defaultDirection)])}>
        Add metal line
      </Button>
    </Box>
  );
}
