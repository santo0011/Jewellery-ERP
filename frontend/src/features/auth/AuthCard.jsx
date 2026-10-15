import { Box, Card, CardContent, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens.js';

/** The card every sign-in screen sits in. `icon` (optional) shows in a gold badge above the title. */
export default function AuthCard({ title, subtitle, children, footer, icon: Icon }) {
  return (
    <>
      <Card sx={{ borderTop: 3, borderTopColor: 'primary.main', boxShadow: '0 1px 2px rgba(23, 23, 23, 0.04), 0 18px 40px -18px rgba(120, 104, 60, 0.35)' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}>
          {Icon && (
            <Box sx={{ width: 52, height: 52, mb: 2, borderRadius: 3, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', boxShadow: '0 10px 24px -8px rgba(var(--brand-rgb), 0.6)' }}>
              <Icon />
            </Box>
          )}
          <Typography variant="h2" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography component="div" variant="body2" color="textSecondary" sx={{ mt: 0.75, lineHeight: 1.6 }}>
              {subtitle}
            </Typography>
          )}
          <Box sx={{ mt: 3 }}>{children}</Box>
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
