import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { InputAdornment, TextField } from '@mui/material';

export default function SearchField({ value, onChange, placeholder = 'Search', maxWidth = 320 }) {
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
