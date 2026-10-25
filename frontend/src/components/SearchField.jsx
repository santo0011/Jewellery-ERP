import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { InputAdornment, TextField } from '@mui/material';
import { t } from '../i18n/index.js';

export default function SearchField({ value, onChange, placeholder = t('Search'), maxWidth = 320 }) {
  return (
    <TextField
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ maxWidth: { sm: maxWidth } }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchRoundedIcon fontSize="small" />
            </InputAdornment>
          ),
        },
        htmlInput: { 'aria-label': placeholder },
      }}
    />
  );
}
