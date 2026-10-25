import { Box, ButtonBase, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useNavigate } from 'react-router';
import { usePermission } from '../../hooks/usePermission.js';
import { purityLabel } from '../products/productForm.js';
import { useCurrentRatesQuery } from './rateApi.js';
import { t } from '../../i18n/index.js';

export default function RateTicker() {
  const allowed = usePermission('rate.view');
  const navigate = useNavigate();
  const { data = [] } = useCurrentRatesQuery(undefined, { skip: !allowed, pollingInterval: 5 * 60 * 1000 });
  if (!allowed) return null;

  const gold = data.filter((r) => r.metal === 'gold').sort((a, b) => Math.abs(a.purity - 916) - Math.abs(b.purity - 916))[0];

  return (
    <ButtonBase
      onClick={() => navigate('/rates')}
      sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: { xs: 0.75, sm: 1 }, px: { xs: 1.25, sm: 1.5 }, height: 36, border: '1px solid rgba(var(--brand-rgb), 0.35)', borderRadius: 999, background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.10), rgba(var(--brand-rgb), 0.02))', transition: 'border-color 160ms ease', '&:hover': { borderColor: 'var(--brand)' } }}
      aria-label={t('Metal rates')}
    >
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: gold?.isToday ? 'success.main' : 'warning.main' }} />
      {gold ? (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            {purityLabel('gold', gold.purity).split(' ')[0]}{' '}
          </Box>
          <Box component="span" sx={{ color: 'accent.main' }}>
            {formatINR(gold.ratePerGramPaise, { decimals: 0 })}
          </Box>
          <Typography component="span" variant="caption" color="textSecondary">
            {t('/g')}
          </Typography>
        </Typography>
      ) : (
        <Typography variant="body2" color="warning">
          {t('Set today\'s rate')}
        </Typography>
      )}
    </ButtonBase>
  );
}
