import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import DisabledDelete from '../../components/DisabledDelete.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import AdvanceDrawer from './AdvanceDrawer.jsx';
import { AdvanceActions } from './AdvanceHistory.jsx';
import { useAdvanceListQuery } from './hrApi.js';
import { monthLabel, payModeLabel } from './hrUi.jsx';
import { t } from '../../i18n/index.js';

const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

export default function AdvancesPage() {
  const navigate = useNavigate();
  const canGive = usePermission('payroll.process');
  const [open, setOpen] = useState(false);
  const [editAdvance, setEditAdvance] = useState(null);
  const list = useListParams({ status: 'open' });
  const { data, isLoading, isFetching, error, refetch } = useAdvanceListQuery(list.params);

  const columns = [
    {
      key: 'employee',
      label: t('Employee'),
      render: (a) => (
        <Box>
          <Typography variant="subtitle2">{a.employee.name}</Typography>
          <Typography variant="caption" color="textSecondary">
            {a.advanceNo} · {payModeLabel(a.mode)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'given',
      label: t('Given on'),
      render: (a) => (
        <Box>
          <Typography variant="body2">{formatDate(a.businessDate)}</Typography>
          <Amount paise={a.amountPaise} decimals={0} sx={{ fontWeight: 600 }} />
        </Box>
      ),
    },
    {
      key: 'plan',
      label: t('Deducted from'),
      render: (a) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {a.recoverFrom ? t('{{monthLabel}} salary', { monthLabel: monthLabel(a.recoverFrom) }) : t('Next payroll')}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {a.instalments <= 1 ? t('All at once') : t('{{installment}} × {{instalments}} months', { installment: formatINR(a.installmentPaise, { decimals: 0 }), instalments: a.instalments })}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'recovered',
      label: t('Recovered'),
      width: 190,
      render: (a) => {
        const pct = Math.round((a.recoveredPaise / a.amountPaise) * 100);
        return (
          <Box sx={{ minWidth: 150 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {formatINR(a.recoveredPaise, { decimals: 0 })}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, color: a.balancePaise ? 'error.main' : 'success.main' }}>
                {a.balancePaise ? t('{{balance}} left', { balance: formatINR(a.balancePaise, { decimals: 0 }) }) : t('Done')}
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={pct} color={a.balancePaise ? 'warning' : 'success'} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        );
      },
    },
    { key: 'status', label: t('Status'), render: (a) => <Chip size="small" label={a.status === 'open' ? t('Recovering') : a.status === 'cancelled' ? t('Cancelled') : t('Closed')} color={a.status === 'open' ? 'warning' : 'default'} variant="outlined" title={a.cancelReason ?? undefined} sx={{ height: 22 }} /> },
  ];

  return (
    <>
      <PageHeader
        title={t('Salary advances')}
        subtitle={
          data?.meta ? (
            <>
              {t('Outstanding with staff:')} <Amount paise={data.meta.outstandingPaise} tone={data.meta.outstandingPaise ? 'due' : 'paid'} decimals={0} /> {t('· recovered automatically from monthly payroll.')}
            </>
          ) : (
            t('Recovered automatically from monthly payroll.')
          )
        }
        actions={
          canGive && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>
              {t('Give advance')}
            </Button>
          )
        }
      />
      <DataTable
        columns={[
          ...columns,
          {
            key: 'actions',
            label: t('Action'),
            align: 'right',
            width: 166,
            render: (a) => (
              <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                <AdvanceActions advance={a} canEdit={canGive} onEdit={setEditAdvance} />
                <ViewButton title={t('Open employee')} name={a.employee.name} onClick={() => navigate(`/hr/employees/${a.employee.id}`)} />
                <DisabledDelete reason={t('Salary advances are in the accounts and cannot be deleted. You can still edit one on the day it was given.')} />
              </Stack>
            ),
          },
        ]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filters.status === 'open' ? t('No advances being recovered') : t('No advances'), description: t('Advances given to staff appear here with what is still to be recovered.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search advance no. or reason')} />
            <TextField select label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 170 }, flexShrink: 0 }}>
              <MenuItem value="">{t('All')}</MenuItem>
              <MenuItem value="open">{t('Recovering')}</MenuItem>
              <MenuItem value="closed">{t('Closed')}</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <AdvanceDrawer open={open} onClose={() => setOpen(false)} />
      <AdvanceDrawer open={Boolean(editAdvance)} advance={editAdvance} onClose={() => setEditAdvance(null)} />
    </>
  );
}
