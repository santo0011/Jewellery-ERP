import { MenuItem, TextField } from '@mui/material';
import { Controller } from 'react-hook-form';
import { t } from '../../i18n/index.js';

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
          helperText={t(fieldState.error?.message) ?? helperText}
          // With a placeholder ("Any", "None", "Select state"), the empty choice is shown in the box like any other,
          // so the label sits above it instead of covering it.
          slotProps={{
            ...slotProps,
            ...(placeholder && { inputLabel: { shrink: true, ...slotProps?.inputLabel } }),
            select: { ...(placeholder && { displayEmpty: true }), ...slotProps?.select, MenuProps: { ...MENU_PROPS, ...slotProps?.select?.MenuProps } },
          }}
          {...props}
        >
          {placeholder && (
            <MenuItem value="" sx={{ color: 'text.secondary' }}>
              <em>{placeholder}</em>
            </MenuItem>
          )}
          {options.map((o) => (
            <MenuItem key={o.value} value={o.value} disabled={Boolean(o.disabled)}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}
