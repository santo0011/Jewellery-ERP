import { Box, Typography } from '@mui/material';
import { APP_NAME } from '../config.js';
import { fonts } from '../theme/tokens.js';

export function DiamondMark({ size = 28 }) {
  return (
    <Box component="svg" viewBox="0 0 64 64" sx={{ width: size, height: size, flexShrink: 0 }} aria-hidden>
      <path d="M32 10 48 26 32 54 16 26Z" fill="none" stroke="#C9A227" strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M16 26h32M25 26l7-16 7 16M25 26l7 28 7-28" fill="none" stroke="#C9A227" strokeWidth="2" strokeLinejoin="round" />
    </Box>
  );
}

export default function Wordmark({ color = 'inherit', compact = false, size = 26 }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, color, minWidth: 0 }}>
      <DiamondMark size={size + 4} />
      {!compact && (
        <Typography noWrap sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: size, lineHeight: 1, letterSpacing: '0.01em' }}>
          {APP_NAME}
        </Typography>
      )}
    </Box>
  );
}
