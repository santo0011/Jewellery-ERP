import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { Navigate, Link as RouterLink, useLocation } from 'react-router';
import { usePermission } from '../../hooks/usePermission.js';
import { tokens } from '../../theme/tokens.js';
import { formatDateTime } from '../../utils/format.js';

const BILLING_PATH = '/settings/subscription';
const REMIND_DAYS = 3;

/** The red strip on top of the Dashboard in the last days before the plan or free period ends. */
function EndingSoonAlert({ subscription: s, canSee }) {
  const when = s.daysLeft === 0 ? 'today' : s.daysLeft === 1 ? 'tomorrow' : `in ${s.daysLeft} days`;
  const what = s.status === 'trial' ? 'Your free period' : `Your ${s.planName ?? ''} subscription`;
  return (
    <Box
      role="alert"
      sx={{
        mb: { xs: 1.5, sm: 2.5 },
        p: { xs: 1.25, sm: 2.25 },
        pl: { xs: 1.5, sm: 2.5 },
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1, sm: 2 },
        borderRadius: { xs: 2.5, sm: 3 },
        color: '#fff',
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(120deg, #7F1D1D 0%, #9B2C2C 45%, #C53030 100%)',
        boxShadow: '0 10px 30px rgba(155, 44, 44, 0.30)',
        '&::after': { content: '""', position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.16), rgba(255,255,255,0) 70%)', pointerEvents: 'none' },
      }}
    >
      <Stack direction="row" spacing={{ xs: 1.25, sm: 2 }} sx={{ alignItems: 'center', flex: 1, minWidth: 0, zIndex: 1 }}>
        <Box
          sx={{
            width: { xs: 34, sm: 52 },
            height: { xs: 34, sm: 52 },
            borderRadius: 2.5,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(255, 255, 255, 0.16)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            '@keyframes ring': { '0%, 100%': { transform: 'rotate(0)' }, '10%, 30%': { transform: 'rotate(-12deg)' }, '20%, 40%': { transform: 'rotate(12deg)' }, '50%': { transform: 'rotate(0)' } },
            '& svg': { animation: 'ring 2.4s ease-in-out infinite', transformOrigin: '50% 10%' },
            '@media (prefers-reduced-motion: reduce)': { '& svg': { animation: 'none' } },
          }}
        >
          <NotificationsActiveOutlinedIcon sx={{ fontSize: { xs: 18, sm: 24 } }} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: '0.875rem', sm: '1.0625rem' }, lineHeight: 1.25 }}>
            {what} ends {when}
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.6875rem', sm: '0.8125rem' }, opacity: 0.88, mt: 0.25, lineHeight: 1.4 }}>
            {/* The exact moment it ends, so "today" is clear (e.g. 13 Oct 2026, 03:45 pm). */}
            {s.endsAt ? `Ends on ${formatDateTime(s.endsAt)}. ` : ''}
            {/* Phones show only the end time, to keep the strip short. */}
            <Box component="span" sx={{ display: { xs: canSee ? 'none' : 'inline', sm: 'inline' } }}>
              {canSee ? 'Renew now so billing, stock and reports keep running without a break.' : 'Please ask your shop owner to renew so the software keeps running.'}
            </Box>
          </Typography>
        </Box>
        {/* Phones: the days left as a small pill beside the title. */}
        <Box sx={{ display: { xs: 'block', sm: 'none' }, flexShrink: 0, textAlign: 'center', px: 0.75, py: 0.375, borderRadius: 1.5, bgcolor: 'rgba(0, 0, 0, 0.2)', minWidth: 44 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 16, lineHeight: 1.1 }}>{s.daysLeft}</Typography>
          <Typography sx={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85, whiteSpace: 'nowrap' }}>{s.daysLeft === 1 ? 'day left' : 'days left'}</Typography>
        </Box>
      </Stack>
      <Stack direction="row" sx={{ gap: 1.5, alignItems: 'center', flexShrink: 0, zIndex: 1 }}>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'center', px: 1.5, py: 0.5, borderRadius: 2, bgcolor: 'rgba(0, 0, 0, 0.18)', minWidth: 64 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 24, lineHeight: 1.1 }}>{s.daysLeft}</Typography>
          <Typography sx={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.85 }}>{s.daysLeft === 1 ? 'day left' : 'days left'}</Typography>
        </Box>
        {canSee && (
          <Button component={RouterLink} to={BILLING_PATH} variant="contained" sx={{ bgcolor: '#fff', color: '#9B2C2C', fontWeight: 800, px: 2.5, boxShadow: 'none', '&:hover': { bgcolor: '#FFF1F1', boxShadow: 'none' }, flex: { xs: 1, sm: 'none' }, minHeight: { xs: 38, sm: 40 }, py: { xs: 0.5, sm: 0.75 } }}>
            {s.status === 'trial' ? 'Choose a plan' : 'Renew now'}
          </Button>
        )}
      </Stack>
    </Box>
  );
}

/**
 * Wraps the app's pages. A lapsed subscription shows a "renew" screen everywhere except the subscription page
 * (the server refuses the data anyway; owners are sent straight there); the last ${REMIND_DAYS} days show a red alert on the Dashboard.
 */
export default function SubscriptionGate({ subscription, children }) {
  const { pathname } = useLocation();
  const canSee = usePermission('subscription.view');
  const onBilling = pathname.startsWith(BILLING_PATH);
  if (!subscription) return children;

  // Lapsed: whoever can renew is taken straight to the subscription page; others see who to ask.
  if (subscription.expired && !onBilling && canSee) return <Navigate to={BILLING_PATH} replace />;
  if (subscription.expired && !onBilling) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <Card sx={{ maxWidth: 480, width: '100%', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
          <Box sx={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: tokens.sidebar.goldGradient }} />
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Box sx={{ width: 64, height: 64, borderRadius: '50%', mx: 'auto', mb: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(155, 44, 44, 0.10)', color: 'error.main' }}>
              <LockOutlinedIcon />
            </Box>
            <Typography variant="h3" sx={{ mb: 1 }}>
              Your subscription has ended
            </Typography>
            <Typography color="textSecondary" sx={{ mb: 3 }}>
              {subscription.planName ? `${subscription.planName} ` : ''}
              {subscription.status === 'expired' && subscription.endsAt ? `ended on ${formatDateTime(subscription.endsAt)}. ` : ''}
              Your data is safe — renew to keep billing, stock and reports running.
            </Typography>
            {canSee ? (
              <Button component={RouterLink} to={BILLING_PATH} variant="contained" size="large">
                Renew now
              </Button>
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Please ask your shop owner to renew the subscription.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    );
  }

  const endingSoon = !subscription.expired && subscription.daysLeft <= REMIND_DAYS && pathname === '/';
  return (
    <>
      {endingSoon && <EndingSoonAlert subscription={subscription} canSee={canSee} />}
      {children}
    </>
  );
}
