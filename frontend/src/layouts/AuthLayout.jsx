import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { Box, Stack, Typography } from '@mui/material';
import { Outlet } from 'react-router';
import Wordmark, { DiamondMark } from '../components/Wordmark.jsx';
import { fonts, tokens } from '../theme/tokens.js';

const HIGHLIGHTS = [
  { icon: ScaleOutlinedIcon, text: 'Weight-accurate stock to the milligram' },
  { icon: ShowChartRoundedIcon, text: 'Gold rate history preserved on every invoice' },
  { icon: AccountBalanceOutlinedIcon, text: 'Every branch, every rupee, one ledger' },
];

// The dark side: near-black with a warm gold glow and a faint diamond lattice.
const NIGHT = '#0E0D0B';
const GLOW = 'radial-gradient(120% 80% at 85% 10%, rgba(var(--brand-rgb), 0.28) 0%, transparent 55%), radial-gradient(90% 70% at 0% 100%, rgba(var(--brand-rgb), 0.16) 0%, transparent 60%)';
const LATTICE = (alpha) =>
  `repeating-linear-gradient(45deg, rgba(var(--brand-rgb), ${alpha}) 0 1px, transparent 1px 34px), repeating-linear-gradient(-45deg, rgba(var(--brand-rgb), ${alpha}) 0 1px, transparent 1px 34px)`;
const GOLD_TEXT = { background: 'linear-gradient(100deg, var(--brand-light) 0%, var(--brand) 45%, #F6E7B0 70%, var(--brand-deep) 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };

/** A large faceted diamond drawn in gold lines, glowing — decoration for the dark panel. */
function BigDiamond({ size, sx }) {
  return (
    <Box aria-hidden sx={{ position: 'absolute', pointerEvents: 'none', filter: 'drop-shadow(0 0 28px rgba(var(--brand-rgb), 0.45))', ...sx }}>
      <DiamondMark size={size} />
    </Box>
  );
}

/**
 * Sign in, register and password screens. Desktop: a dark gold-lit brand panel beside a light form side.
 * Phones: the same dark panel as a hero band on top, with the form card rising over its edge.
 */
export default function AuthLayout() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 6fr' }, bgcolor: 'background.default' }}>
      {/* Desktop brand panel */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          color: '#F7F3E8',
          p: { md: 5, lg: 7 },
          background: `${GLOW}, ${NIGHT}`,
          '&::before': { content: '""', position: 'absolute', inset: 0, backgroundImage: LATTICE(0.07), maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.9), rgba(0,0,0,0.15))', pointerEvents: 'none' },
          '&::after': { content: '""', position: 'absolute', top: 0, right: 0, bottom: 0, width: '1px', background: 'linear-gradient(180deg, transparent, var(--brand) 30%, var(--brand) 70%, transparent)', opacity: 0.6 },
        }}
      >
        <BigDiamond size={340} sx={{ right: -90, top: '18%', opacity: 0.22 }} />
        <BigDiamond size={90} sx={{ right: 120, top: '9%', opacity: 0.35 }} />

        <Box sx={{ position: 'relative' }}>
          <Wordmark size={28} />
        </Box>

        <Box sx={{ position: 'relative', maxWidth: 480 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'var(--brand-light)', mb: 2 }}>Jewellery ERP</Typography>
          <Typography sx={{ fontFamily: fonts.display, fontSize: { md: 40, lg: 48 }, lineHeight: 1.08, fontWeight: 500, mb: 4 }}>
            The quiet engine behind a{' '}
            <Box component="span" sx={{ ...GOLD_TEXT, fontStyle: 'italic' }}>
              fine jewellery
            </Box>{' '}
            business.
          </Typography>
          <Stack spacing={1.25}>
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <Stack
                key={text}
                direction="row"
                spacing={1.75}
                sx={{ alignItems: 'center', px: 1.75, py: 1.25, borderRadius: 2.5, bgcolor: 'rgba(255, 255, 255, 0.035)', border: '1px solid rgba(var(--brand-rgb), 0.18)', backdropFilter: 'blur(6px)' }}
              >
                <Box sx={{ width: 34, height: 34, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', boxShadow: '0 6px 18px -6px rgba(var(--brand-rgb), 0.7)' }}>
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="body2" sx={{ color: '#E9E4D6', fontWeight: 500 }}>
                  {text}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Box>

        <Stack direction="row" spacing={1} sx={{ position: 'relative', alignItems: 'center', color: '#8C877C' }}>
          <VerifiedUserOutlinedIcon sx={{ fontSize: 16, color: 'var(--brand)' }} />
          <Typography variant="body2" sx={{ color: 'inherit' }}>
            Secure · Multi-branch · Built for Indian jewellers
          </Typography>
        </Stack>
      </Box>

      {/* Form side */}
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: { xs: 'flex-start', md: 'center' },
          px: { xs: 0, md: 4 },
          pb: { xs: 4, md: 6 },
          pt: { xs: 0, md: 6 },
          overflow: 'hidden',
          '&::before': { content: '""', position: 'absolute', inset: 0, backgroundImage: LATTICE(0.05), maskImage: 'radial-gradient(70% 60% at 50% 40%, rgba(0,0,0,0.9), transparent)', pointerEvents: 'none', display: { xs: 'none', md: 'block' } },
        }}
      >
        {/* Phones: the brand as a dark hero band; the card rises over its lower edge. */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            position: 'relative',
            overflow: 'hidden',
            width: '100%',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            color: '#F7F3E8',
            pt: 'calc(env(safe-area-inset-top) + 40px)',
            pb: 9,
            px: 3,
            background: `${GLOW}, ${NIGHT}`,
            borderBottomLeftRadius: 28,
            borderBottomRightRadius: 28,
            '&::before': { content: '""', position: 'absolute', inset: 0, backgroundImage: LATTICE(0.08), maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.8), transparent)', pointerEvents: 'none' },
          }}
        >
          <BigDiamond size={180} sx={{ right: -50, top: -30, opacity: 0.2 }} />
          <Box sx={{ position: 'relative' }}>
            <Wordmark size={26} />
          </Box>
          <Typography sx={{ position: 'relative', mt: 1.5, fontFamily: fonts.display, fontSize: 19, lineHeight: 1.3 }}>
            The quiet engine behind a{' '}
            <Box component="span" sx={{ ...GOLD_TEXT, fontStyle: 'italic' }}>
              fine jewellery
            </Box>{' '}
            business.
          </Typography>
        </Box>

        <Box sx={{ position: 'relative', width: '100%', maxWidth: { xs: 480, md: 440 }, px: { xs: 2, md: 0 }, mt: { xs: -6, md: 0 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
