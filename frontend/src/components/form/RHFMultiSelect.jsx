import { Box, Checkbox, Chip, ListItemText, MenuItem, TextField } from '@mui/material';
import { Controller } from 'react-hook-form';

export default function RHFMultiSelect({ name, control, options, helperText, ...props }) {
  const labelFor = (value) => options.find((o) => o.value === value)?.label ?? value;
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          {...field}
          select
          value={field.value ?? []}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? helperText}
          slotProps={{
            select: {
              multiple: true,
              renderValue: (selected) => (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {selected.map((v) => (
                    <Chip key={v} label={labelFor(v)} size="small" sx={{ height: 22 }} />
                  ))}
                </Box>
              ),
            },
          }}
          {...props}
        >
          {options.map((o) => (
            <MenuItem key={o.value} value={o.value} dense>
              <Checkbox size="small" checked={(field.value ?? []).includes(o.value)} sx={{ p: 0.5, mr: 1 }} />
              <ListItemText primary={o.label} secondary={o.description} />
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}
