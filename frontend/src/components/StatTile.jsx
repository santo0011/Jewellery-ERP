import { Card, Typography } from '@mui/material';
import ClampText from './ClampText.jsx';

/**
 * A small number with its label (report summaries, attendance totals). The label keeps two lines on phones and one
 * from tablets up (cut with …, full text on tap), so tiles in a row are the same height and their numbers line up.
 */
export default function StatTile({ label, value, tone }) {
  return (
    <Card sx={{ height: '100%', p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <ClampText lines={{ xs: 2, sm: 1 }} reserve lineHeight={1.35} color="textSecondary" sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' }, fontWeight: 500 }}>
        {label}
      </ClampText>
      <Typography
        title={typeof value === 'string' ? value : undefined}
        sx={{ mt: 'auto', fontSize: { xs: '1.125rem', sm: '1.375rem' }, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: tone ?? 'text.primary', fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    </Card>
  );
}
