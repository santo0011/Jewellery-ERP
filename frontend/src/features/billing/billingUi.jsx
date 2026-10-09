import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Box, Button, Card, CardContent, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { fonts, tokens } from '../../theme/tokens.js';

export const inr = (p) => formatINR(p ?? 0, { decimals: 0 });
export const periodText = (months) => (months === 12 ? 'year' : months === 1 ? 'month' : `${months} months`);
export const limitText = (v, noun) => (v == null ? `Unlimited ${noun}` : `${v.toLocaleString('en-IN')} ${noun}`);

const SUB = { trial: ['Free trial', 'info'], active: ['Active', 'success'], expired: ['Expired', 'error'], suspended: ['Suspended', 'error'], cancelled: ['Cancelled', 'default'], past_due: ['Past due', 'warning'] };
export function SubscriptionChip({ status, size = 'small' }) {
  const [label, color] = SUB[status] ?? [status ?? '—', 'default'];
  return <Chip size={size} label={label} color={color} sx={{ fontWeight: 700, height: size === 'small' ? 22 : 28 }} />;
}

const PAY = { paid: ['Paid', 'success', 'filled'], created: ['Pending', 'warning', 'outlined'], failed: ['Failed', 'error', 'outlined'], expired: ['Expired', 'default', 'outlined'] };
export function PaymentStatusChip({ status }) {
  const [label, color, variant] = PAY[status] ?? [status, 'default', 'outlined'];
  return <Chip size="small" label={label} color={color} variant={variant} sx={{ height: 22, fontWeight: 600 }} />;
}

export const methodLabel = (m) => ({ upi: 'UPI', card: 'Card', credit_card: 'Credit card', debit_card: 'Debit card', net_banking: 'Net banking', netbanking: 'Net banking', wallet: 'Wallet', bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', free: 'Free plan', other: 'Other' })[m] ?? (m ? m.replace(/_/g, ' ') : '—');

/** "3 of 5 users" with a bar that turns amber near the limit and red at it. */
export function UsageBar({ label, used, limit }) {
  const pct = limit == null ? 0 : Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const color = limit == null ? 'success' : pct >= 100 ? 'error' : pct >= 80 ? 'warning' : 'primary';
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          {used.toLocaleString('en-IN')} {limit == null ? '· unlimited' : `of ${limit.toLocaleString('en-IN')}`}
        </Typography>
      </Stack>
      <LinearProgress variant="determinate" value={limit == null ? 100 : pct} color={color} sx={{ height: 7, borderRadius: 4, opacity: limit == null ? 0.35 : 1 }} />
    </Box>
  );
}

/**
 * A plan as a pricing card. `current` marks the plan in use; `action` is the button (buy, edit…);
 * `muted` greys out an inactive plan in the Super Admin's list.
 */
export function PlanCard({ plan, current, action, muted, footer }) {
  const popular = plan.isPopular && !muted;
  return (
    <Card
      sx={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: muted ? 0.6 : 1,
        border: popular || current ? '2px solid' : 1,
        borderColor: current ? 'success.main' : popular ? tokens.light.gold : 'divider',
        boxShadow: popular ? '0 12px 28px rgba(156, 122, 22, 0.16)' : undefined,
      }}
    >
      {(popular || current) && (
        <Box sx={{ position: 'absolute', top: 0, right: 16, px: 1.25, py: 0.25, borderRadius: '0 0 8px 8px', fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: current ? '#fff' : '#171717', background: current ? undefined : tokens.sidebar.goldGradient, bgcolor: current ? 'success.main' : undefined }}>
          {current ? 'Current plan' : 'Most popular'}
        </Box>
      )}
      <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', pt: 3 }}>
        <Typography sx={{ fontFamily: fonts.display, fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{plan.name}</Typography>
        {plan.description && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5, minHeight: 20 }}>
            {plan.description}
          </Typography>
        )}
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', mt: 2 }}>
          <Typography sx={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{plan.pricePaise ? inr(plan.pricePaise) : 'Free'}</Typography>
          {plan.pricePaise > 0 && <Typography color="textSecondary">/ {periodText(plan.durationMonths)}</Typography>}
        </Stack>
        <Typography variant="caption" color="textSecondary" sx={{ minHeight: 18 }}>
          {plan.durationMonths > 1 && plan.pricePaise ? `${inr(plan.monthlyPaise)} a month` : ' '}
        </Typography>

        <Stack spacing={0.75} sx={{ my: 2 }}>
          {[limitText(plan.limits?.users, 'users'), limitText(plan.limits?.branches, 'branches'), limitText(plan.limits?.products, 'products'), ...(plan.features ?? [])].map((f) => (
            <Stack key={f} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <CheckRoundedIcon sx={{ fontSize: 17, color: 'success.main' }} />
              <Typography variant="body2">{f}</Typography>
            </Stack>
          ))}
        </Stack>
        <Box sx={{ mt: 'auto' }}>{action}</Box>
        {footer}
      </CardContent>
    </Card>
  );
}

export function PlanAction({ children, ...props }) {
  return (
    <Button fullWidth size="large" variant="contained" {...props}>
      {children}
    </Button>
  );
}
