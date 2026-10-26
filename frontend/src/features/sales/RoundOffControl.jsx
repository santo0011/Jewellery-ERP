import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { Box, Chip, InputAdornment, Link, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { formatINR, ROUND_OFF_UNITS, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { usePermission } from '../../hooks/usePermission.js';
import { t } from '../../i18n/index.js';

/** A round-off for this bill: Auto follows Tax settings; the rest are this bill's own (within the limit). */
export const AUTO_ROUND_OFF = Object.freeze({ mode: 'auto', unitPaise: 100, adjustmentPaise: 0 });

const MODES = [
  { value: 'auto', label: t('Auto') },
  { value: 'nearest', label: t('Nearest') },
  { value: 'down', label: t('Down'), lowers: true },
  { value: 'manual', label: t('Manual') },
  { value: 'none', label: t('Off') },
];
const unitLabel = (paise) => formatINR(paise, { decimals: 0 });
const signed = (paise) => `${paise > 0 ? '+' : paise < 0 ? '−' : ''}${formatINR(Math.abs(paise))}`;

/**
 * How this bill is rounded. Manual takes the final amount the customer pays (or a quick +/− step); the difference
 * from the amount before round-off is the adjustment. Rounding lower than Auto needs discount rights (`canLower`).
 *   value          { mode, unitPaise, adjustmentPaise }
 *   beforePaise    the bill before round-off (from the last quote)
 *   offsetPaise    bill total less what is collected now (advances, old gold; minus any previous due added), so the
 *                  final amount typed is the amount collected, as shown under "To collect"
 *   limitPaise     the most a bill may be rounded by
 */
export default function RoundOffControl({ value, onChange, beforePaise, offsetPaise = 0, limitPaise, canLower, disabled }) {
  const canEditSettings = usePermission('settings.edit');
  const [finalAmount, setFinalAmount] = useState('');
  useEffect(() => {
    if (value.mode !== 'manual') setFinalAmount('');
  }, [value.mode]);

  const set = (patch) => onChange({ ...value, ...patch });
  // The final amount is applied once typed (Enter or leaving the box): while typing, "7" of "75950" would be
  // a huge adjustment and flash the limit error.
  const applyFinal = () => {
    let target = null;
    try {
      target = finalAmount ? toPaise(finalAmount) : null;
    } catch {
      target = null;
    }
    if (target != null && beforePaise != null) set({ adjustmentPaise: target + offsetPaise - beforePaise });
  };
  const step = (paise) => {
    setFinalAmount('');
    set({ adjustmentPaise: value.adjustmentPaise + paise });
  };
  const tooMuch = value.mode === 'manual' && limitPaise != null && Math.abs(value.adjustmentPaise) > limitPaise;

  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="overline" color="textSecondary">
          {t('Round off')}
        </Typography>
        {limitPaise != null &&
          (canEditSettings ? (
            // The limit is set in Business settings → Tax & GST ("Largest round-off on a bill").
            <Tooltip title={t('Change the limit in Business settings')}>
              <Link component={RouterLink} to="/settings/business?tab=tax" variant="caption" underline="hover" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, fontWeight: 600 }}>
                {t('Up to {{limit}}', { limit: formatINR(limitPaise, { decimals: 0 }) })}
                <SettingsOutlinedIcon sx={{ fontSize: 13 }} />
              </Link>
            </Tooltip>
          ) : (
            <Typography variant="caption" color="textSecondary">
              {t('Up to {{limit}}', { limit: formatINR(limitPaise, { decimals: 0 }) })}
            </Typography>
          ))}
      </Stack>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
        {MODES.map((m) => (
          <Chip
            key={m.value}
            label={m.label}
            onClick={() => set({ mode: m.value, ...(m.value !== 'manual' && { adjustmentPaise: 0 }) })}
            color={value.mode === m.value ? 'primary' : 'default'}
            variant={value.mode === m.value ? 'filled' : 'outlined'}
            disabled={disabled || (m.lowers && !canLower)}
            title={m.lowers && !canLower ? t('Needs permission to give discounts') : undefined}
            sx={{ height: 30, fontWeight: 600, minWidth: 64 }}
          />
        ))}
      </Stack>

      {['nearest', 'down', 'up'].includes(value.mode) && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1.25, alignItems: 'center' }}>
          <Typography variant="caption" color="textSecondary" sx={{ mr: 0.5 }}>
            {t('Round to')}
          </Typography>
          {ROUND_OFF_UNITS.map((u) => (
            <Chip key={u} size="small" label={unitLabel(u)} onClick={() => set({ unitPaise: u })} color={value.unitPaise === u ? 'primary' : 'default'} variant={value.unitPaise === u ? 'filled' : 'outlined'} disabled={disabled} sx={{ fontWeight: 600 }} />
          ))}
        </Stack>
      )}

      {value.mode === 'manual' && (
        <Box sx={{ mt: 1.25 }}>
          <TextField
            size="small"
            label={t('Final amount')}
            placeholder={beforePaise != null ? ((beforePaise - offsetPaise) / 100).toFixed(2) : ''}
            value={finalAmount}
            onChange={(e) => setFinalAmount(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={applyFinal}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyFinal();
              }
            }}
            disabled={disabled}
            error={tooMuch}
            helperText={tooMuch ? t('More than the round-off limit — give a discount instead') : t('What the customer pays for this bill')}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
          />
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1, alignItems: 'center' }}>
            {[-100, -1000, 100, 1000].map((p) => (
              <Chip key={p} size="small" variant="outlined" label={`${p > 0 ? '+' : '−'} ${unitLabel(Math.abs(p))}`} onClick={() => step(p)} disabled={disabled || (p < 0 && !canLower)} sx={{ fontWeight: 600 }} />
            ))}
            <Typography variant="caption" sx={{ ml: 'auto', fontWeight: 700, color: value.adjustmentPaise < 0 ? 'error.main' : value.adjustmentPaise > 0 ? 'success.main' : 'text.secondary' }}>
              {t('Adjustment {{amount}}', { amount: signed(value.adjustmentPaise) })}
            </Typography>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

export { signed as signedINR };
