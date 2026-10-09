import { Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';

/** One rule for the whole app: money received is green, money still owed is red. */
export const MONEY_TONE = { paid: 'success.main', due: 'error.main' };

/** A rupee amount coloured by meaning: `tone="paid"` (received) or `tone="due"` (still owed). */
export default function Amount({ paise, tone, decimals = 2, prefix = '', suffix = '', sx, ...props }) {
  return (
    <Typography component="span" variant="body2" {...props} sx={{ fontWeight: 600, whiteSpace: 'nowrap', color: tone ? MONEY_TONE[tone] : 'text.primary', ...sx }}>
      {prefix}
      {formatINR(paise, { decimals })}
      {suffix}
    </Typography>
  );
}

/**
 * A balance that can go either way. Positive = still owed (red, e.g. "receivable" from a customer, "payable" to a
 * supplier); negative = paid in advance (green). Zero shows "Nil".
 */
export function BalanceAmount({ paise, owedLabel, advanceLabel, decimals = 2, ...props }) {
  if (!paise) return 'Nil';
  return (
    <Amount paise={Math.abs(paise)} tone={paise > 0 ? 'due' : 'paid'} decimals={decimals} suffix={` ${paise > 0 ? owedLabel : advanceLabel}`} {...props} />
  );
}
