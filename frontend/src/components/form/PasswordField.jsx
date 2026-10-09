import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { IconButton, InputAdornment } from '@mui/material';
import { useState } from 'react';
import RHFTextField from './RHFTextField.jsx';

export default function PasswordField(props) {
  const [visible, setVisible] = useState(false);
  return (
    <RHFTextField
      type={visible ? 'text' : 'password'}
      slotProps={{
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => setVisible((v) => !v)} edge="end" size="small" aria-label={visible ? 'Hide password' : 'Show password'}>
                {visible ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
      {...props}
    />
  );
}
