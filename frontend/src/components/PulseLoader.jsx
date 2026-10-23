import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { t } from '../i18n/index.js';

// A slow breath: the dot swells and fades, then settles — like ChatGPT's "thinking" dot.
const breathe = keyframes`
  0%, 100% { transform: scale(0.72); opacity: 0.55; }
  50% { transform: scale(1); opacity: 1; }
`;

/** The loading indicator: one soft dot in the brand colour, breathing. */
export default function PulseLoader({ size = 16, label = t('Loading') }) {
  return (
    <Box
      role="progressbar"
      aria-label={label}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: 'radial-gradient(circle at 35% 35%, var(--brand-light), var(--brand) 60%, var(--brand-deep))',
        boxShadow: '0 0 0 4px rgba(var(--brand-rgb), 0.12), 0 4px 12px -2px rgba(var(--brand-rgb), 0.55)',
        animation: `${breathe} 1.4s ease-in-out infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0.85 },
      }}
    />
  );
}

/** The same breathing dot inside a busy button (Sign in, Save…), in the button's text colour. */
export function ButtonPulse() {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        bgcolor: 'currentColor',
        animation: `${breathe} 1.4s ease-in-out infinite`,
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }}
    />
  );
}
