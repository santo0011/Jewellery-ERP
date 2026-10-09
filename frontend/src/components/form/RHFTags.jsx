import { Autocomplete, Chip, TextField } from '@mui/material';
import { Controller } from 'react-hook-form';

export default function RHFTags({ name, control, label, helperText, max = 10 }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <Autocomplete
          multiple
          freeSolo
          options={[]}
          value={field.value ?? []}
          onChange={(e, value) => field.onChange([...new Set(value.map((v) => v.trim()).filter(Boolean))].slice(0, max))}
          renderValue={(value, getItemProps) => value.map((option, index) => <Chip size="small" label={option} {...getItemProps({ index })} key={option} />)}
          renderInput={(params) => (
            <TextField {...params} label={label} error={Boolean(fieldState.error)} helperText={fieldState.error?.message ?? helperText ?? 'Press Enter to add'} />
          )}
        />
      )}
    />
  );
}
