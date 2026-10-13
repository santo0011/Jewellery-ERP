import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditLocationAltOutlinedIcon from '@mui/icons-material/EditLocationAltOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Alert, Autocomplete, Box, CircularProgress, Grid, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { ADDRESS_FIELDS, INDIAN_STATES, stateName } from '@jerp/shared';
import { useEffect, useRef, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import RHFSelect from './RHFSelect.jsx';
import RHFTextField from './RHFTextField.jsx';

const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }));
const PIN = /^[1-9][0-9]{5}$/;

/** Form values for an address (create: empty; edit: the saved one). Same fields everywhere (ADDRESS_FIELDS). */
export const addressFormValues = (address) => Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, address?.[f] ?? '']));

/** The address as it will be saved and printed, one line per part. */
export function formatAddress(a = {}, stateCode) {
  const state = stateName(stateCode ?? a.stateCode);
  return [
    a.line1,
    a.line2,
    a.landmark && `Near ${a.landmark}`,
    [a.postOffice && a.postOffice !== a.city ? `${a.postOffice} PO` : null, a.city].filter(Boolean).join(', '),
    [a.district && a.district !== a.city ? a.district : null, state, a.pincode].filter(Boolean).join(', ').replace(/, (\d{6})$/, ' – $1'),
  ].filter(Boolean);
}

/**
 * An Indian address that starts from the PIN code: entering 6 digits looks up the post offices, city, district and
 * state (India Post) and fills them in; house/shop, area/street and landmark are typed. Every field stays editable,
 * a preview shows the address as it will be saved, and an unknown PIN (or no connection) simply means typing it all.
 *
 * Fields live under `name` (line1, line2, landmark, postOffice, city, district, pincode); the state is the separate
 * `stateField` (the GST state). `lookup(pin)` resolves to { postOffices, city, district, stateCode } or throws.
 */
export default function PincodeAddressFields({ control, setValue, lookup, name = 'address', stateField = 'stateCode' }) {
  const values = useWatch({ control, name });
  const stateCode = useWatch({ control, name: stateField });
  const pin = values?.pincode ?? '';
  const [status, setStatus] = useState({ kind: 'idle' }); // idle | loading | found | missing | unavailable
  const [offices, setOffices] = useState([]);
  // What the last look-up filled in: a field is refilled by the next one only while the person has not changed it.
  const filled = useRef({});

  const fill = (field, value, fullName = `${name}.${field}`) => {
    if (!value) return;
    const current = field === stateField ? stateCode : values?.[field];
    if (!current || current === filled.current[field]) {
      setValue(fullName, value, { shouldDirty: true, shouldValidate: true });
      filled.current[field] = value;
    }
  };

  const find = async (code) => {
    if (!PIN.test(code)) return;
    setStatus({ kind: 'loading' });
    try {
      const r = await lookup(code);
      setOffices(r.postOffices ?? []);
      const office = r.postOffices?.find((o) => o.delivery) ?? r.postOffices?.[0];
      fill('postOffice', office?.name);
      fill('city', r.city);
      fill('district', r.district);
      fill(stateField, r.stateCode, stateField);
      setStatus({ kind: 'found', district: r.district, state: r.state, count: r.postOffices?.length ?? 0 });
    } catch (err) {
      setOffices([]);
      const code404 = err?.status === 404 || err?.data?.error?.code === 'PIN_NOT_FOUND';
      setStatus({ kind: code404 ? 'missing' : 'unavailable' });
    }
  };

  // Look up as soon as a full PIN is typed (or pasted).
  useEffect(() => {
    if (PIN.test(pin)) find(pin);
    else setStatus({ kind: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const preview = formatAddress(values, stateCode);

  return (
    <Stack spacing={2}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 5 }}>
          <RHFTextField
            control={control}
            name={`${name}.pincode`}
            label="PIN code"
            placeholder="6 digits"
            transform={(v) => v.replace(/\D/g, '').slice(0, 6)}
            helperText={status.kind === 'idle' ? 'Fills post office, city, district and state' : ' '}
            slotProps={{
              htmlInput: { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' },
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    {status.kind === 'loading' ? (
                      <CircularProgress size={18} />
                    ) : status.kind === 'found' ? (
                      <CheckCircleRoundedIcon color="success" fontSize="small" />
                    ) : (
                      <Tooltip title="Look up this PIN code">
                        <span>
                          <IconButton size="small" edge="end" onClick={() => find(pin)} disabled={!PIN.test(pin)} aria-label="Look up PIN code">
                            <SearchRoundedIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </InputAdornment>
                ),
              },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          {/* Pick from the PIN's post offices, or type one. */}
          <Controller
            control={control}
            name={`${name}.postOffice`}
            render={({ field }) => (
              <Autocomplete
                freeSolo
                options={offices.map((o) => o.name)}
                value={field.value ?? ''}
                onChange={(e, v) => field.onChange(v ?? '')}
                onInputChange={(e, v, reason) => reason === 'input' && field.onChange(v)}
                renderOption={({ key, ...props }, option) => {
                  const o = offices.find((x) => x.name === option);
                  return (
                    <Box component="li" key={key} {...props} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <span>{option}</span>
                      {o?.branchType && (
                        <Typography variant="caption" color="textSecondary">
                          {o.branchType}
                        </Typography>
                      )}
                    </Box>
                  );
                }}
                renderInput={(p) => <TextField {...p} label="Post office" helperText={offices.length > 1 ? `${offices.length} post offices for this PIN — pick yours` : ' '} />}
              />
            )}
          />
        </Grid>
      </Grid>

      {status.kind === 'found' && (
        <Alert severity="success" variant="outlined" icon={<LocationOnOutlinedIcon fontSize="inherit" />} sx={{ py: 0 }}>
          {status.district}, {status.state} — filled in below. Check and change anything that is not right.
        </Alert>
      )}
      {(status.kind === 'missing' || status.kind === 'unavailable') && (
        <Alert severity="info" variant="outlined" icon={<EditLocationAltOutlinedIcon fontSize="inherit" />} sx={{ py: 0 }}>
          {status.kind === 'missing' ? 'This PIN code was not found.' : 'PIN code look-up is not available right now.'} Please enter the address below yourself.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={12}>
          <RHFTextField control={control} name={`${name}.line1`} label="House / shop no. & building" placeholder="e.g. Shop 12, Gold Plaza" />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          <RHFTextField control={control} name={`${name}.line2`} label="Area / street" placeholder="e.g. Bowbazar Street" />
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }}>
          <RHFTextField control={control} name={`${name}.landmark`} label="Landmark (optional)" placeholder="e.g. Opposite City Mall" />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <RHFTextField control={control} name={`${name}.city`} label="City / town" />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <RHFTextField control={control} name={`${name}.district`} label="District" />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <RHFSelect control={control} name={stateField} label="State (GST)" options={STATE_OPTIONS} placeholder="Select state" />
        </Grid>
      </Grid>

      {/* What will be saved, to verify before submitting. */}
      <Box sx={{ p: 1.75, borderRadius: 2, border: '1px dashed', borderColor: preview.length > 1 ? 'rgba(var(--brand-rgb), 0.45)' : 'divider', bgcolor: preview.length > 1 ? 'rgba(var(--brand-rgb), 0.05)' : 'transparent' }}>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
          Address preview
        </Typography>
        {preview.length > 1 ? (
          preview.map((line) => (
            <Typography key={line} variant="body2" sx={{ lineHeight: 1.6 }}>
              {line}
            </Typography>
          ))
        ) : (
          <Typography variant="body2" color="textSecondary">
            Enter the PIN code to start — the address appears here as it will be saved.
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
