import { Box, Stack, Typography } from '@mui/material';
import { fonts, tokens } from '../theme/tokens.js';

/**
 * Phones: a page's header as a small dark, gold-lit card (the side menu's colours) — an icon, the title in the
 * display font, a short line under it, and whatever the page puts below (a period switch, a button).
 * `compact`: a shorter card with smaller type (every page but the dashboard). `avatar`: initials shown in the gold
 * circle in place of the icon (a person's page).
 */
export default function PhoneHero({ icon: Icon, avatar, title, subtitle, children, compact = false }) {
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2.5, mb: 1.75, px: 1.75, py: compact ? 1.5 : 2.5, background: `${tokens.sidebar.glow}, ${tokens.sidebar.surface}`, color: '#F7F3E8', boxShadow: '0 14px 32px -20px rgba(0, 0, 0, 0.6)' }}>
      <Box aria-hidden sx={{ position: 'absolute', width: 180, height: 180, right: -60, top: -80, borderRadius: '50%', border: '1px solid rgba(var(--brand-rgb), 0.22)' }} />
      <Stack direction="row" spacing={1.25} sx={{ position: 'relative', alignItems: 'center', mb: children ? (compact ? 1.25 : 2) : 0 }}>
        {(avatar || Icon) && (
          <Box sx={{ width: compact ? 32 : 38, height: compact ? 32 : 38, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', fontFamily: fonts.display, fontSize: compact ? 14 : 16, fontWeight: 700 }}>
            {avatar || <Icon sx={{ fontSize: compact ? 17 : 20 }} />}
          </Box>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h1" noWrap sx={{ fontFamily: fonts.display, fontSize: compact ? 20 : 24, fontWeight: 600, lineHeight: 1.15 }}>
            {title}
          </Typography>
          {/* Up to two lines, cut with … after that. */}
          {subtitle && (
            <Typography component="div" sx={{ fontSize: compact ? '0.6875rem' : '0.75rem', lineHeight: 1.4, mt: 0.25, color: 'rgba(247, 243, 232, 0.65)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      </Stack>
      {children && <Box sx={{ position: 'relative' }}>{children}</Box>}
    </Box>
  );
}
