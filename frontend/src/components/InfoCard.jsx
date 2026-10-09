import { Box, Card, CardContent, Typography } from '@mui/material';

export default function InfoCard({ title, items, children, action }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="overline" color="textSecondary">
            {title}
          </Typography>
          {action}
        </Box>
        {items && (
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(120px, auto) 1fr' }, columnGap: 2, rowGap: { xs: 0.25, sm: 1 } }}>
            {items
              .filter((i) => !i.hidden)
              .map((i) => (
                <Box key={i.label} sx={{ display: 'contents' }}>
                  <Typography component="dt" variant="body2" color="textSecondary" sx={{ mt: { xs: 1, sm: 0 } }}>
                    {i.label}
                  </Typography>
                  <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 500, overflowWrap: 'anywhere' }}>
                    {i.value === null || i.value === undefined || i.value === '' ? '—' : i.value}
                  </Typography>
                </Box>
              ))}
          </Box>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
