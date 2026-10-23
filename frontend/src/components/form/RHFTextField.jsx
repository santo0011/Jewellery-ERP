import { TextField } from '@mui/material';
import { Controller } from 'react-hook-form';
import { t } from '../../i18n/index.js';

export default function RHFTextField({ name, control, helperText, transform, ...props }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          value={field.value ?? ''}
          onChange={(e) => field.onChange(transform ? transform(e.target.value) : e.target.value)}
          error={Boolean(fieldState.error)}
          helperText={t(fieldState.error?.message) ?? helperText}
          {...props}
        />
      )}
    />
  );
}
