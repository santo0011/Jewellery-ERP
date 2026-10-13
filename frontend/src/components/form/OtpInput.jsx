import { Box, Stack } from '@mui/material';
import { useEffect, useRef } from 'react';

/**
 * A 6-digit code in six boxes: typing moves to the next box, Backspace goes back, and pasting a whole code
 * fills every box. Only digits are accepted. `value` is the code so far (string), `onChange(code)`.
 */
export default function OtpInput({ value = '', onChange, length = 6, error = false, disabled = false, autoFocus = false, onComplete }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setAt = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    const code = next.join('').slice(0, length);
    onChange(code);
    if (code.length === length) onComplete?.(code);
  };

  const handleChange = (index) => (e) => {
    const typed = e.target.value.replace(/\D/g, '');
    if (!typed) return;
    if (typed.length > 1) {
      // Pasted or autofilled: spread across the boxes from here.
      const code = (digits.slice(0, index).join('') + typed).slice(0, length);
      onChange(code);
      refs.current[Math.min(code.length, length - 1)]?.focus();
      if (code.length === length) onComplete?.(code);
      return;
    }
    setAt(index, typed);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index) => (e) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        onChange(digits.slice(0, index).join(''));
      } else if (index > 0) {
        onChange(digits.slice(0, index - 1).join(''));
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    else if (e.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
    if (pasted.length === length) onComplete?.(pasted);
  };

  return (
    <Stack direction="row" spacing={{ xs: 0.75, sm: 1 }} sx={{ justifyContent: 'center' }} role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <Box
          key={i}
          component="input"
          ref={(el) => (refs.current[i] = el)}
          value={d}
          onChange={handleChange(i)}
          onKeyDown={handleKeyDown(i)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          sx={(theme) => ({
            width: { xs: 42, sm: 48 },
            height: { xs: 50, sm: 56 },
            textAlign: 'center',
            fontSize: { xs: 22, sm: 24 },
            fontWeight: 700,
            fontFamily: 'monospace',
            borderRadius: 2,
            border: '1px solid',
            borderColor: error ? 'error.main' : d ? 'rgba(201, 162, 39, 0.7)' : 'divider',
            bgcolor: d ? 'rgba(201, 162, 39, 0.08)' : 'background.paper',
            color: 'text.primary',
            outline: 'none',
            transition: 'border-color 120ms, box-shadow 120ms',
            '&:focus': { borderColor: error ? 'error.main' : theme.palette.primary.main, boxShadow: `0 0 0 3px ${error ? 'rgba(155, 44, 44, 0.15)' : 'rgba(201, 162, 39, 0.25)'}` },
            '&:disabled': { opacity: 0.6 },
          })}
        />
      ))}
    </Stack>
  );
}
