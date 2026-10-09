import { Grid } from '@mui/material';
import { INDIAN_STATES } from '@jerp/shared';
import RHFSelect from './RHFSelect.jsx';
import RHFTextField from './RHFTextField.jsx';

const STATE_OPTIONS = INDIAN_STATES.map((s) => ({ value: s.code, label: s.name }));

export default function AddressFields({ control, name = 'address', disabled = false }) {
  return (
    <Grid container spacing={2}>
      <Grid size={12}>
        <RHFTextField control={control} name={`${name}.line1`} label="Address line 1" disabled={disabled} />
      </Grid>
      <Grid size={12}>
        <RHFTextField control={control} name={`${name}.line2`} label="Address line 2" disabled={disabled} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <RHFTextField control={control} name={`${name}.city`} label="City" disabled={disabled} />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <RHFTextField
          control={control}
          name={`${name}.pincode`}
          label="PIN code"
          disabled={disabled}
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 6 } }}
        />
      </Grid>
      <Grid size={12}>
        <RHFSelect control={control} name={`${name}.stateCode`} label="State" options={STATE_OPTIONS} placeholder="Select state" disabled={disabled} />
      </Grid>
    </Grid>
  );
}
