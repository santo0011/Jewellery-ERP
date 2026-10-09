import { Box, ButtonBase, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useNavigate } from 'react-router';
import { usePermission } from '../../hooks/usePermission.js';
import { purityLabel } from '../products/productForm.js';
import { useCurrentRatesQuery } from './rateApi.js';

export default function RateTicker() {
  const allowed = usePermission('rate.view');
  const navigate = useNavigate();
  const { data = [] } = useCurrentRatesQuery(undefined, { skip: !allowed, pollingInterval: 5 * 60 * 1000 });
  if (!allowed) return null;

  const gold = data.filter((r) => r.metal === 'gold').sort((a, b) => Math.abs(a.purity - 916) - Math.abs(b.purity - 916))[0];

  return (
    <ButtonBase
      onClick={() => navigate('/rates')}
      sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1, px: 1.5, py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1 }}
      aria-label="Metal rates"
    >
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: gold?.isToday ? 'success.main' : 'warning.main' }} />
      {gold ? (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {purityLabel('gold', gold.purity).split(' ')[0]}{' '}
          <Box component="span" sx={{ color: 'accent.main' }}>
            {formatINR(gold.ratePerGramPaise, { decimals: 0 })}
          </Box>
          <Typography component="span" variant="caption" color="textSecondary">
            /g
          </Typography>
        </Typography>
      ) : (
        <Typography variant="body2" color="warning">
          Set today's rate
        </Typography>
      )}
    </ButtonBase>
  );
}
