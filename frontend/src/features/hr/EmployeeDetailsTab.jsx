import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import ContactPhoneOutlinedIcon from '@mui/icons-material/ContactPhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import { Box, Card, CardContent, Grid, IconButton, Link, Stack, Tooltip, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import Amount from '../../components/Amount.jsx';
import { tokens } from '../../theme/tokens.js';
import { formatDate } from '../../utils/format.js';
import { EmploymentChip, monthLabel, todayIso } from './hrUi.jsx';

const GOLD_TINT = 'rgba(var(--brand-rgb), 0.12)';

/** "2 yrs 3 mos", "5 mos", "12 days" between two ISO dates. */
function tenure(from, to) {
  if (!from) return null;
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  if (b < a) return 'Joins soon';
  let months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  if (months < 1) return plural(Math.round((b - a) / 86400000) + 1, 'day');
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? plural(years, 'yr') : null, rest ? plural(rest, 'mo') : null].filter(Boolean).join(' ');
}

function Section({ icon: Icon, title, caption, children, action }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: GOLD_TINT, color: 'accent.main' }}>
            <Icon sx={{ fontSize: 19 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.25 }}>
              {title}
            </Typography>
            {caption && (
              <Typography variant="caption" color="textSecondary">
                {caption}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

const missing = (v) => v === null || v === undefined || v === '';

/** One labelled line in a section. Empty values read "Not added" in grey, so gaps are easy to spot. */
function Row({ icon: Icon, label, children, multiline }) {
  const empty = missing(children);
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 1.1, borderTop: 1, borderColor: 'divider', alignItems: multiline ? 'flex-start' : 'center' }}>
      {Icon && <Icon sx={{ fontSize: 18, color: 'text.secondary', mt: multiline ? 0.25 : 0 }} />}
      <Typography variant="body2" color="textSecondary" sx={{ width: { xs: 96, sm: 120 }, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0, fontSize: '0.875rem', fontWeight: empty ? 400 : 600, color: empty ? 'text.disabled' : 'text.primary', textAlign: 'right', overflowWrap: 'anywhere', whiteSpace: multiline ? 'pre-line' : 'normal' }}>
        {empty ? 'Not added' : children}
      </Box>
    </Stack>
  );
}

function MonthStat({ label, value, tone }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, textAlign: 'center', py: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.2, color: value ? tone : 'text.secondary' }}>{value}</Typography>
      <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block' }}>
        {label}
      </Typography>
    </Box>
  );
}

function AccountNumber({ value }) {
  const [shown, setShown] = useState(false);
  if (missing(value)) return null;
  const masked = value.length > 4 ? `•••• ${value.slice(-4)}` : value;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
      <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', letterSpacing: shown ? 0 : '0.04em' }}>
        {shown ? value : masked}
      </Box>
      <Tooltip title={shown ? 'Hide' : 'Show full number'}>
        <IconButton size="small" onClick={() => setShown((s) => !s)} aria-label={shown ? 'Hide account number' : 'Show account number'} sx={{ p: 0.25 }}>
          {shown ? <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
        </IconButton>
      </Tooltip>
    </Stack>
  );
}

/** The salary split as a bar: basic in gold, allowance in a lighter shade. */
function SalarySplit({ basicPaise, allowancePaise }) {
  const gross = basicPaise + allowancePaise;
  const basicPct = gross ? (basicPaise / gross) * 100 : 100;
  return (
    <Box sx={{ mt: 1.5, mb: 1 }}>
      <Box sx={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', bgcolor: 'action.hover' }}>
        <Box sx={{ width: `${basicPct}%`, background: tokens.sidebar.goldGradient }} />
        <Box sx={{ flex: 1, bgcolor: 'rgba(var(--brand-rgb), 0.35)' }} />
      </Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1 }}>
        {[
          ['Basic', basicPaise, tokens.brand.main],
          ['Allowance', allowancePaise, 'rgba(var(--brand-rgb), 0.45)'],
        ].map(([label, paise, color]) => (
          <Stack key={label} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
            <Typography variant="caption" color="textSecondary">
              {label}
            </Typography>
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              {paise ? formatINR(paise, { decimals: 0 }) : 'Nil'}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}

/** The employee's Details tab: employment, contact, salary and bank, laid out as four sections. */
export default function EmployeeDetailsTab({ employee: e }) {
  const left = e.status === 'left';
  const today = todayIso();
  const month = today.slice(0, 7);
  const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const att = e.attendance;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 7 }}>
        <Stack spacing={2} sx={{ height: '100%' }}>
          <Section icon={WorkOutlineOutlinedIcon} title="Employment" caption={left ? `Worked ${tenure(e.joiningDate, e.exitDate)}` : `With you for ${tenure(e.joiningDate, today)}`} action={<EmploymentChip status={e.status} />}>
            <Row icon={BadgeOutlinedIcon} label="Employee code">
              {e.code}
            </Row>
            <Row icon={WorkOutlineOutlinedIcon} label="Designation">
              {e.designation}
            </Row>
            <Row icon={StorefrontOutlinedIcon} label="Branch">
              {e.branch?.name}
            </Row>
            <Row icon={EventAvailableOutlinedIcon} label="Joined">
              {formatDate(e.joiningDate)}
            </Row>
            {left && (
              <Row icon={EventAvailableOutlinedIcon} label="Left on">
                {formatDate(e.exitDate)}
              </Row>
            )}
            {att && !left && (
              <Box sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
                  {monthLabel(att.month)} so far
                </Typography>
                <Stack direction="row" spacing={1}>
                  <MonthStat label="Absent" value={att.absent} tone="error.main" />
                  <MonthStat label="Half days" value={att.halfDay} tone="warning.main" />
                  <MonthStat label="Paid leave" value={att.paidLeave} tone="info.main" />
                  <MonthStat label="Holidays" value={att.holiday} tone="text.primary" />
                </Stack>
              </Box>
            )}
          </Section>

          <Section icon={ContactPhoneOutlinedIcon} title="Contact">
            <Row icon={CallOutlinedIcon} label="Mobile">
              {e.mobile && (
                <Link href={`tel:${e.mobile}`} underline="hover" color="inherit">
                  {e.mobile}
                </Link>
              )}
            </Row>
            <Row icon={EmailOutlinedIcon} label="Email">
              {e.email && (
                <Link href={`mailto:${e.email}`} underline="hover" color="inherit">
                  {e.email}
                </Link>
              )}
            </Row>
            <Row icon={HomeOutlinedIcon} label="Address" multiline>
              {e.address}
            </Row>
            {e.notes && (
              <Row icon={NotesOutlinedIcon} label="Notes" multiline>
                {e.notes}
              </Row>
            )}
          </Section>
        </Stack>
      </Grid>

      {e.payVisible && (
        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={2} sx={{ height: '100%' }}>
            <Section icon={PaymentsOutlinedIcon} title="Salary" caption="Per month, before deductions">
              <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                {formatINR(e.grossPaise, { decimals: 0 })}
                <Typography component="span" variant="body2" color="textSecondary" sx={{ fontWeight: 500 }}>
                  {' '}
                  / month
                </Typography>
              </Typography>
              <SalarySplit basicPaise={e.basicPaise} allowancePaise={e.allowancePaise} />
              <Row label="Per day">
                {formatINR(Math.round(e.grossPaise / daysInMonth), { decimals: 0 })}
                <Typography component="span" variant="caption" color="textSecondary">
                  {' '}
                  ({daysInMonth}-day month)
                </Typography>
              </Row>
              <Row label="Advance due">{e.advanceBalancePaise ? <Amount paise={e.advanceBalancePaise} tone="due" decimals={0} /> : <Box component="span" sx={{ color: 'success.main' }}>Nil</Box>}</Row>
            </Section>

            <Section icon={AccountBalanceOutlinedIcon} title="Bank & tax" caption="Where salary is paid">
              <Row label="Account name">{e.bank?.accountName}</Row>
              <Row label="Account no.">{e.bank?.accountNumber && <AccountNumber value={e.bank.accountNumber} />}</Row>
              <Row label="IFSC">{e.bank?.ifsc}</Row>
              <Row label="PAN">{e.pan}</Row>
            </Section>
          </Stack>
        </Grid>
      )}
    </Grid>
  );
}
