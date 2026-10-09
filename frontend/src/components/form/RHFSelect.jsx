import { MenuItem, TextField } from '@mui/material';
import { Controller } from 'react-hook-form';

// Open as a dropdown under the field (MUI's default overlays the field and can grow to full screen height).
const MENU_PROPS = {
  anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
  transformOrigin: { vertical: 'top', horizontal: 'left' },
  slotProps: { paper: { sx: { maxHeight: 320, mt: 0.5 } } },
};

export default function RHFSelect({ name, control, options, placeholder, helperText, slotProps, ...props }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          select
          value={field.value ?? ''}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          slotProps={{ ...slotProps, select: { ...slotProps?.select, MenuProps: { ...MENU_PROPS, ...slotProps?.select?.MenuProps } } }}
          {...props}
        >
          {placeholder && (
            <MenuItem value="" sx={{ color: 'text.secondary' }}>
              <em>{placeholder}</em>
            </MenuItem>
          )}
          {options.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}
