import { Box, Stack, Typography } from '@mui/material';
import { Outlet } from 'react-router';
import Wordmark from '../components/Wordmark.jsx';
import { fonts, tokens } from '../theme/tokens.js';

const HIGHLIGHTS = ['Weight-accurate stock to the milligram', 'Gold rate history preserved on every invoice', 'Every branch, every rupee, one ledger'];

export default function AuthLayout() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 6fr' }, bgcolor: 'background.default' }}>
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          bgcolor: tokens.sidebar.background,
          color: '#F7F3E8',
          p: 6,
          borderRight: `1px solid ${tokens.light.goldDark}`,
        }}
      >
        <Wordmark size={28} />
        <Box>
          <Typography sx={{ fontFamily: fonts.display, fontSize: 44, lineHeight: 1.1, fontWeight: 500, mb: 3, maxWidth: 440 }}>
            The quiet engine behind a fine jewellery business.
          </Typography>
          <Stack spacing={1.5}>
            {HIGHLIGHTS.map((h) => (
              <Stack key={h} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 6, height: 6, transform: 'rotate(45deg)', bgcolor: tokens.light.gold, flexShrink: 0 }} />
                <Typography variant="body2" sx={{ color: tokens.sidebar.text }}>
                  {h}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
        <Typography variant="body2" sx={{ color: tokens.sidebar.muted }}>
          Secure · Multi-branch · Built for Indian jewellers
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: 2, py: 5 }}>
        <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 4 }}>
          <Wordmark size={26} />
        </Box>
        <Box sx={{ width: '100%', maxWidth: 440 }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
