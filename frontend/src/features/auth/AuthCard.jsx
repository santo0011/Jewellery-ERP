import { Box, Card, CardContent, Typography } from '@mui/material';
import { fonts, tokens } from '../../theme/tokens.js';

/**
 * The card every sign-in screen sits in: a gold hairline on top, a soft deep shadow. `eyebrow` is a small gold
 * caption over the title; `icon` (optional) shows in a gold badge above it.
 */
export default function AuthCard({ title, subtitle, eyebrow, children, footer, icon: Icon }) {
  return (
    <>
      <Card
        sx={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: { xs: 4, sm: 4.5 },
          border: '1px solid rgba(var(--brand-rgb), 0.22)',
          boxShadow: '0 1px 2px rgba(23, 23, 23, 0.05), 0 24px 60px -24px rgba(80, 64, 20, 0.45), 0 0 0 6px rgba(var(--brand-rgb), 0.05)',
          '&::before': { content: '""', position: 'absolute', inset: '0 0 auto 0', height: 4, background: 'linear-gradient(90deg, var(--brand-deep), var(--brand-light) 35%, var(--brand) 65%, var(--brand-deep))' },
          '&::after': { content: '""', position: 'absolute', top: -80, right: -80, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(var(--brand-rgb), 0.12), transparent 70%)', pointerEvents: 'none' },
        }}
      >
        <CardContent sx={{ position: 'relative', p: { xs: 3, sm: 4.5 }, '&:last-child': { pb: { xs: 3, sm: 4.5 } } }}>
          {Icon && (
            <Box sx={{ width: 52, height: 52, mb: 2, borderRadius: 3, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', boxShadow: '0 10px 24px -8px rgba(var(--brand-rgb), 0.6)' }}>
              <Icon />
            </Box>
          )}
          {eyebrow && (
            <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--brand-strong)', mb: 0.75 }}>{eyebrow}</Typography>
          )}
          <Typography component="h1" sx={{ fontFamily: fonts.display, fontSize: { xs: 28, sm: 32 }, fontWeight: 600, lineHeight: 1.15 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography component="div" variant="body2" color="textSecondary" sx={{ mt: 0.75, lineHeight: 1.6 }}>
              {subtitle}
            </Typography>
          )}
          <Box sx={{ mt: { xs: 2.5, sm: 3.5 } }}>{children}</Box>
        </CardContent>
      </Card>
      {footer && (
        <Typography variant="body2" color="textSecondary" sx={{ mt: 3, textAlign: 'center' }}>
          {footer}
        </Typography>
      )}
    </>
  );
}
