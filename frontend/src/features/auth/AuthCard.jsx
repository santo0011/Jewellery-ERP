import { Box, Card, CardContent, Typography } from '@mui/material';

export default function AuthCard({ title, subtitle, children, footer }) {
  return (
    <>
      <Card sx={{ borderTop: 3, borderTopColor: 'primary.main' }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}>
          <Typography variant="h2" component="h1">
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 0.75 }}>
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
