import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { formatINR } from '@jerp/shared';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import RowActions, { actionsWidth } from '../../components/RowActions.jsx';
import { useListEditor } from '../../hooks/useListEditor.js';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import EmployeeFormDrawer from './EmployeeFormDrawer.jsx';
import { EmployeeAvatar } from './EmployeePhoto.jsx';
import { useEmployeeListQuery, useEmployeeQuery } from './hrApi.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';
import { useDeleteStatus } from '../../services/recordApi.js';
import { t } from '../../i18n/index.js';


export default function EmployeesPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canCreate = usePermission('employee.create');
  const canEdit = usePermission('employee.edit');
  const editor = useListEditor(useEmployeeQuery);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Branch follows the navbar branch filter.
  const list = useListParams({ status: 'active' });
  const { data, isLoading, isFetching, error, refetch } = useEmployeeListQuery(list.params);
  // Which rows can be deleted (Delete stays visible; it is disabled with the reason when not).
  const deleteStatus = useDeleteStatus('employee', data?.items);
  const multiBranch = session.branches.length > 1;
  const payVisible = data?.items?.[0]?.payVisible ?? false;

  const columns = [
    {
      key: 'name',
      label: t('Employee'),
      render: (e) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <EmployeeAvatar employee={e} size={40} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle2">{e.name}</Typography>
              {e.status === 'left' && <Chip size="small" label={t('Left')} variant="outlined" sx={{ height: 18, fontSize: '0.6875rem' }} />}
            </Stack>
            <Typography variant="body2" color="textSecondary">
              {e.designation} · {e.code}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'mobile', label: t('Mobile'), render: (e) => e.mobile },
    ...(multiBranch ? [{ key: 'branch', label: t('Branch'), render: (e) => e.branch?.name ?? '—' }] : []),
    ...(payVisible
      ? [
          { key: 'salary', label: t('Salary / month'), align: 'right', render: (e) => <Amount paise={e.grossPaise} decimals={0} /> },
          {
            key: 'advance',
            label: t('Advance due'),
            align: 'right',
            render: (e) => (e.advanceBalancePaise ? <Amount paise={e.advanceBalancePaise} tone="due" decimals={0} /> : <Typography variant="body2" color="textSecondary">—</Typography>),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={t('Employees')}
        subtitle={data?.meta ? (list.filters.status === 'left' ? t('{{total}} former staff', { total: data.meta.total }) : (list.filters.status === 'active' ? t('{{total}} working staff', { total: data.meta.total }) : t('{{total}} staff', { total: data.meta.total }))).replace('  ', ' ') : t('Your staff')}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawerOpen(true)}>
              {t('New employee')}
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={BadgeOutlinedIcon} label={t('Working staff')} value={data.meta.summary.working} caption={t('Currently on the rolls')} onClick={() => list.setFilter('status', 'active')} />
          {data.meta.summary.salaryPaise !== undefined && <SummaryCard icon={PaymentsOutlinedIcon} label={t('Monthly salary bill')} value={formatINR(data.meta.summary.salaryPaise, { decimals: 0 })} caption={t('Gross, before deductions')} tone="blue" />}
          {data.meta.summary.advancePaise !== undefined && (
            <SummaryCard
              icon={RequestQuoteOutlinedIcon}
              label={t('Advances due')}
              value={formatINR(data.meta.summary.advancePaise, { decimals: 0 })}
              caption={data.meta.summary.advancePeople ? t('With {{advancePeople}} staff', { advancePeople: data.meta.summary.advancePeople }) : t('Nothing outstanding')}
              tone={data.meta.summary.advancePaise ? 'red' : 'green'}
              valueTone={data.meta.summary.advancePaise ? 'due' : 'paid'}
              onClick={() => navigate('/hr/advances')}
            />
          )}
          <SummaryCard icon={PersonOffOutlinedIcon} label={t('Left')} value={data.meta.summary.left} caption={t('Former staff')} tone="grey" onClick={() => list.setFilter('status', 'left')} />
        </SummaryCards>
      )}
      <DataTable
        columns={[
          ...columns,
          {
            key: 'actions',
            label: t('Action'),
            align: 'right',
            width: actionsWidth(3),
            render: (e) => <RowActions onView={() => navigate(`/hr/employees/${e.id}`)} onEdit={canEdit ? () => editor.open(e) : undefined} deleteType="employee" deleteStatus={deleteStatus(e.id)} id={e.id} name={e.name} />,
          },
        ]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered && list.search ? { title: t('No matching employees'), description: t('Try another name, mobile or code.') } : { title: t('No employees yet'), description: t('Add your staff to start marking attendance and running payroll.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search name, mobile, code or designation')} />
            <ToggleButtonGroup exclusive size="small" value={list.filters.status} onChange={(e, v) => v !== null && list.setFilter('status', v)} aria-label={t('Show')} sx={{ flexShrink: 0, height: 40 }}>
              <ToggleButton value="active">{t('Working')}</ToggleButton>
              <ToggleButton value="left">{t('Left')}</ToggleButton>
              <ToggleButton value="">{t('All')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
      />
      <EmployeeFormDrawer open={drawerOpen} employee={null} onClose={() => setDrawerOpen(false)} />
      <EmployeeFormDrawer open={Boolean(editor.record)} employee={editor.record} onClose={editor.close} />
    </>
  );
}
