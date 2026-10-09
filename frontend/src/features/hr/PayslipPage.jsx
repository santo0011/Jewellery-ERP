import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { Alert, Box, Button, Card, Divider, GlobalStyles, Grid, Stack, Typography } from '@mui/material';
import { formatINR, rupeesInWords } from '@jerp/shared';
import { useParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { useEmployeeQuery, usePayrollRunQuery } from './hrApi.js';
import { formatDays, payModeLabel } from './hrUi.jsx';
import { daysSummary } from './PayrollRunPage.jsx';

// Print only the payslip, on plain white paper.
const printStyles = (
  <GlobalStyles
    styles={{
      '@media print': {
        'body *': { visibility: 'hidden' },
        '#payslip-sheet, #payslip-sheet *': { visibility: 'visible' },
        '#payslip-sheet': { position: 'absolute', inset: 0, margin: 0, boxShadow: 'none !important', border: '0 !important' },
        '@page': { size: 'A4', margin: '14mm' },
      },
    }}
  />
);

function Row({ label, value, strong }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', py: 0.6 }}>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Stack>
  );
}

function Field({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: '#6b6b6b' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value || '—'}
      </Typography>
    </Box>
  );
}

export default function PayslipPage() {
  const { id, employeeId } = useParams();
  const { data: session } = useSession();
  const { data: run, isLoading, error, refetch } = usePayrollRunQuery(id);
  const canSeeEmployee = usePermission('employee.view');
  const { data: emp } = useEmployeeQuery(employeeId, { skip: !canSeeEmployee });

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const l = run.lines.find((x) => String(x.employeeId) === employeeId);
  if (!l) return <EmptyState title="Not in this payroll" description="This employee is not part of the selected payroll." />;

  const deductions = l.otherDeductionPaise + l.advanceDeductionPaise;
  const bank = emp?.bank;

  return (
    <>
      {printStyles}
      <PageHeader
        title={`Payslip · ${l.name}`}
        subtitle={`${run.monthLabel} · ${run.runNo}`}
        back={{ to: `/hr/payroll/${run.id}`, label: `Payroll ${run.monthLabel}` }}
        actions={
          <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />
      {run.status === 'draft' && (
        <Alert severity="warning" sx={{ mb: 2, maxWidth: 820, mx: 'auto' }}>
          Draft payroll — figures can still change until it is finalised.
        </Alert>
      )}

      <Card id="payslip-sheet" sx={{ maxWidth: 820, mx: 'auto', p: { xs: 2.5, sm: 4 }, bgcolor: '#fff', color: '#171717' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="h2" sx={{ color: '#171717' }}>
              {session.organisation.name}
            </Typography>
            <Typography variant="body2" sx={{ color: '#6b6b6b' }}>
              {run.branch?.name}
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="overline" sx={{ color: '#8a6d14', letterSpacing: '0.12em' }}>
              Salary slip
            </Typography>
            <Typography variant="h3" sx={{ color: '#171717' }}>
              {run.monthLabel}
            </Typography>
          </Box>
        </Stack>
        <Divider sx={{ borderColor: '#e5e1d8' }} />

        <Grid container spacing={2} sx={{ my: 1 }}>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Field label="Employee" value={l.name} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Field label="Employee code" value={l.code} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Field label="Designation" value={l.designation} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Field label="Date of joining" value={emp ? formatDate(emp.joiningDate) : null} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Field label="Paid days" value={`${formatDays(l.payableDays)} of ${l.daysInMonth}`} />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <Field label="Attendance" value={daysSummary(l)} />
          </Grid>
          {bank?.accountNumber && (
            <Grid size={{ xs: 12, sm: 8 }}>
              <Field label="Bank account" value={[bank.accountName, bank.accountNumber, bank.ifsc].filter(Boolean).join(' · ')} />
            </Grid>
          )}
          {emp?.pan && (
            <Grid size={{ xs: 6, sm: 4 }}>
              <Field label="PAN" value={emp.pan} />
            </Grid>
          )}
        </Grid>

        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="overline" sx={{ color: '#6b6b6b' }}>
              Earnings
            </Typography>
            <Divider sx={{ borderColor: '#e5e1d8' }} />
            <Row label="Basic (monthly)" value={formatINR(l.basicPaise)} />
            {l.allowancePaise > 0 && <Row label="Allowance (monthly)" value={formatINR(l.allowancePaise)} />}
            <Row label={`Earned for ${formatDays(l.payableDays)} days`} value={formatINR(l.earnedPaise)} />
            {l.bonusPaise > 0 && <Row label="Bonus / incentive" value={formatINR(l.bonusPaise)} />}
            <Divider sx={{ borderColor: '#e5e1d8' }} />
            <Row label="Total earnings" value={formatINR(l.earnedPaise + l.bonusPaise)} strong />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Typography variant="overline" sx={{ color: '#6b6b6b' }}>
              Deductions
            </Typography>
            <Divider sx={{ borderColor: '#e5e1d8' }} />
            {l.advanceDeductionPaise > 0 && <Row label="Salary advance recovery" value={formatINR(l.advanceDeductionPaise)} />}
            {l.otherDeductionPaise > 0 && <Row label="Other deductions" value={formatINR(l.otherDeductionPaise)} />}
            {!deductions && <Row label="None" value={formatINR(0)} />}
            <Divider sx={{ borderColor: '#e5e1d8' }} />
            <Row label="Total deductions" value={formatINR(deductions)} strong />
            {l.advanceBalancePaise > l.advanceDeductionPaise && (
              <Typography variant="caption" sx={{ color: '#6b6b6b' }}>
                Advance still outstanding after this month: {formatINR(l.advanceBalancePaise - l.advanceDeductionPaise)}
              </Typography>
            )}
          </Grid>
        </Grid>

        <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: '#f7f3e8', border: '1px solid #e5e1d8' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Net pay
            </Typography>
            <Typography variant="h2" sx={{ color: '#171717' }}>
              {formatINR(l.netPaise)}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ color: '#6b6b6b' }}>
            {rupeesInWords(l.netPaise)}
          </Typography>
          {l.paid?.at && (
            <Typography variant="body2" sx={{ mt: 0.5, color: '#2e6b3a', fontWeight: 600 }}>
              {l.paid.mode ? `Paid by ${payModeLabel(l.paid.mode)} on ${formatDateTime(l.paid.at)}${l.paid.reference ? ` · Ref ${l.paid.reference}` : ''}` : 'Nothing payable this month'}
            </Typography>
          )}
        </Box>
        {l.note && (
          <Typography variant="body2" sx={{ mt: 2, color: '#6b6b6b' }}>
            Note: {l.note}
          </Typography>
        )}

        <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 6 }}>
          <Typography variant="caption" sx={{ color: '#6b6b6b', borderTop: '1px solid #bbb', pt: 0.5, minWidth: 160, textAlign: 'center' }}>
            Employee signature
          </Typography>
          <Typography variant="caption" sx={{ color: '#6b6b6b', borderTop: '1px solid #bbb', pt: 0.5, minWidth: 160, textAlign: 'center' }}>
            Authorised signatory
          </Typography>
        </Stack>
      </Card>
    </>
  );
}
