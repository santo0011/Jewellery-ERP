import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { t } from '../../i18n/index.js';
import { fonts, tokens } from '../../theme/tokens.js';

// Green for money the customer has with the shop, red for money they owe.
const TONE = {
  paid: { color: tokens.light.success, tint: 'rgba(46, 107, 79, 0.08)', ring: 'rgba(46, 107, 79, 0.35)', icon: SavingsOutlinedIcon },
  due: { color: tokens.light.danger, tint: 'rgba(155, 44, 44, 0.06)', ring: 'rgba(155, 44, 44, 0.35)', icon: PendingActionsOutlinedIcon },
};

/**
 * The customer's balance from before, settled on this bill only when chosen and confirmed:
 *   advance  — their advance from before comes off this bill (up to what the bill needs)
 *   due      — their due from before is added to what is collected; money paid beyond the bill goes to it
 *   value         { advance: boolean, due: boolean }
 *   advanceLeft   advance from before still free · previousDue  what they owe from earlier bills / old due
 *   collectBefore what this bill asks without the advance from before (to show the change in the dialog)
 */
export default function PreviousBalance({ value, onChange, advanceLeft, previousDue, collectBefore, name, disabled }) {
  const [asking, setAsking] = useState(null); // 'advance' | 'due'
  if (!advanceLeft && !previousDue) return null;

  const advanceUsed = Math.min(advanceLeft, Math.max(0, collectBefore));
  const toggle = (key) => (value[key] ? onChange({ ...value, [key]: false }) : setAsking(key));
  const confirm = () => {
    onChange({ ...value, [asking]: true });
    setAsking(null);
  };
  // What is collected now, before and after the choice being confirmed (the other choice as it is).
  const now = collectBefore - (value.advance ? advanceUsed : 0) + (value.due ? previousDue : 0);
  const after = asking === 'advance' ? now - advanceUsed : now + previousDue;
  const tone = TONE[asking === 'advance' ? 'paid' : 'due'];

  return (
    <Box sx={{ mt: 2, p: 1.5, borderRadius: 3, border: 1, borderColor: 'rgba(var(--brand-rgb), 0.28)', background: 'linear-gradient(180deg, rgba(var(--brand-rgb), 0.07) 0%, rgba(var(--brand-rgb), 0.015) 100%)' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.25 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: 2, display: 'grid', placeItems: 'center', background: tokens.brand.gradient, color: 'var(--brand-contrast)', flexShrink: 0 }}>
          <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 16 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {t('Previous balance')}
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', lineHeight: 1.3 }}>
            {t('Choose what to settle on this bill')}
          </Typography>
        </Box>
      </Stack>
      <Stack spacing={1}>
        {advanceLeft > 0 && <Option tone="paid" selected={value.advance} disabled={disabled} title={t('Previous advance')} amount={`− ${formatINR(advanceLeft)}`} hint={value.advance ? t('Adjusted on this bill') : t('Tap to adjust on this bill')} onClick={() => toggle('advance')} />}
        {previousDue > 0 && <Option tone="due" selected={value.due} disabled={disabled} title={t('Previous due')} amount={`+ ${formatINR(previousDue)}`} hint={value.due ? t('Added to what is collected') : t('Tap to add to this bill')} onClick={() => toggle('due')} />}
      </Stack>

      <Dialog open={Boolean(asking)} onClose={() => setAsking(null)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 4, overflow: 'hidden' } } }}>
        {/* Header: what is being settled, and how much. */}
        <Box sx={{ px: 3, pt: 3, pb: 2.5, textAlign: 'center', background: `${tokens.sidebar.glow}, ${tokens.sidebar.surface}`, color: '#F7F3E8' }}>
          <Box sx={{ mx: 'auto', mb: 1.25, width: 48, height: 48, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(247, 243, 232, 0.1)', border: '1px solid rgba(var(--brand-rgb), 0.45)', color: asking === 'advance' ? '#9BD3B5' : '#F4A09A' }}>
            <tone.icon />
          </Box>
          <Typography sx={{ fontWeight: 700, fontSize: '1.0625rem' }}>{asking === 'advance' ? t('Adjust previous advance?') : t('Add previous due?')}</Typography>
          <Typography sx={{ fontFamily: fonts.display, fontSize: 34, fontWeight: 700, lineHeight: 1.15, mt: 0.5, color: asking === 'advance' ? '#9BD3B5' : '#F4A09A' }}>
            {asking === 'advance' ? `− ${formatINR(advanceUsed)}` : `+ ${formatINR(previousDue)}`}
          </Typography>
        </Box>
        <DialogContent sx={{ pt: 2.5 }}>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2, textAlign: 'center' }}>
            {asking === 'advance'
              ? t('{{amount}} of {{name}}’s advance from before comes off this bill.', { amount: formatINR(advanceUsed), name })
              : t('{{name}}’s due of {{amount}} from earlier bills is added. Money paid beyond this bill goes to it; anything unpaid stays due.', { amount: formatINR(previousDue), name })}
          </Typography>
          {/* Before → after, one above the other. */}
          <Box sx={{ borderRadius: 2.5, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
            <Stack direction="row" sx={{ px: 2, py: 1.25, justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography variant="body2" color="textSecondary">
                {t('To collect now')}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatINR(Math.max(0, now))}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ px: 2, py: 0.75, alignItems: 'center', bgcolor: tone.tint, color: tone.color }}>
              <ArrowDownwardRoundedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" sx={{ fontWeight: 700, flex: 1 }}>
                {asking === 'advance' ? t('Previous advance') : t('Previous due')}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {asking === 'advance' ? `− ${formatINR(advanceUsed)}` : `+ ${formatINR(previousDue)}`}
              </Typography>
            </Stack>
            <Stack direction="row" sx={{ px: 2, py: 1.25, justifyContent: 'space-between', alignItems: 'baseline', bgcolor: 'rgba(var(--brand-rgb), 0.06)' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {t('To collect after')}
              </Typography>
              <Typography sx={{ fontFamily: fonts.display, fontSize: 24, fontWeight: 700, lineHeight: 1, color: 'var(--brand-strong)' }}>{formatINR(Math.max(0, after))}</Typography>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button color="secondary" onClick={() => setAsking(null)} sx={{ flex: 1 }}>
            {t('Go back')}
          </Button>
          <Button variant="contained" startIcon={<CheckRoundedIcon />} onClick={confirm} sx={{ flex: 1.4 }}>
            {asking === 'advance' ? t('Yes, adjust') : t('Yes, add')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

/** One balance to settle: icon, what it is, the amount, and whether it is on this bill. */
function Option({ tone: toneKey, selected, disabled, title, amount, hint, onClick }) {
  const tone = TONE[toneKey];
  const Icon = tone.icon;
  return (
    <Box
      component="button"
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1.25,
        borderRadius: 2.5,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        border: 1,
        borderColor: selected ? tone.ring : 'divider',
        bgcolor: selected ? tone.tint : 'background.paper',
        boxShadow: selected ? `0 0 0 3px ${tone.tint}` : '0 1px 2px rgba(0, 0, 0, 0.04)',
        transition: 'border-color .15s, background-color .15s, box-shadow .15s, transform .15s',
        '&:hover': disabled ? undefined : { borderColor: tone.ring, transform: 'translateY(-1px)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: tone.color, outlineOffset: 2 },
      }}
    >
      <Box sx={{ position: 'relative', width: 36, height: 36, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: tone.tint, color: tone.color }}>
        <Icon sx={{ fontSize: 19 }} />
        {selected && (
          <Box sx={{ position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: tone.color, color: '#fff', border: '2px solid', borderColor: 'background.paper' }}>
            <CheckRoundedIcon sx={{ fontSize: 10 }} />
          </Box>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.3, color: selected ? tone.color : 'text.secondary', fontWeight: selected ? 600 : 400 }}>
          {hint}
        </Typography>
      </Box>
      <Typography sx={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap', color: tone.color, lineHeight: 1 }}>{amount}</Typography>
    </Box>
  );
}
