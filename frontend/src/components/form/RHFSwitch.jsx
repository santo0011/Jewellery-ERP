import { Box, FormControlLabel, Switch, Typography } from '@mui/material';
import { Controller } from 'react-hook-form';

export default function RHFSwitch({ name, control, label, description, disabled }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControlLabel
          disabled={disabled}
          sx={{ alignItems: 'flex-start', ml: 0, gap: 1.5, '& .MuiSwitch-root': { mt: -0.75 } }}
          control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {label}
              </Typography>
              {description && (
                <Typography variant="body2" color="textSecondary">
                  {description}
                </Typography>
              )}
            </Box>
          }
        />
      )}
    />
  );
}
