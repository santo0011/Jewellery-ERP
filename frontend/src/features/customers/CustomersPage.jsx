import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { CUSTOMER_SEGMENTS, formatINR } from '@jerp/shared';
import Amount, { MONEY_TONE } from '../../components/Amount.jsx';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import CustomerFormDrawer from './CustomerFormDrawer.jsx';
import { useCustomerListQuery, useCustomerQuery } from './customerApi.js';
import RowActions, { actionsWidth } from '../../components/RowActions.jsx';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CollectDueDialog from './CollectDueDialog.jsx';
import { useListEditor } from '../../hooks/useListEditor.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { useDeleteStatus } from '../../services/recordApi.js';
import { t } from '../../i18n/index.js';

export const segmentLabel = (v) => CUSTOMER_SEGMENTS.find((s) => s.value === v)?.label ?? v;
const SEGMENT_COLORS = { vip: 'primary', high_value: 'accent', inactive: 'default', regular: 'default', new: 'info' };

export function SegmentChip({ segment }) {
  return <Chip size="small" label={segmentLabel(segment)} color={SEGMENT_COLORS[segment] ?? 'default'} variant="outlined" sx={{ height: 22 }} />;
}

const initialsOf = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

/** One line of the Balance cell: the amount over a small coloured label. */
function BalanceLine({ paise, tone, label, hint }) {
  return (
    <Box sx={{ textAlign: { md: 'right' } }}>
      <Amount paise={paise} tone={tone} decimals={0} sx={{ fontWeight: 800, fontSize: '0.9375rem' }} />
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: { md: 'flex-end' }, mt: 0.25 }}>
        <Box component="span" sx={{ px: 0.75, py: 0.125, borderRadius: 1, fontSize: '0.625rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: MONEY_TONE[tone], bgcolor: tone === 'due' ? 'rgba(155, 44, 44, 0.08)' : 'rgba(46, 107, 79, 0.10)' }}>
          {label}
        </Box>
        {hint && (
          <Typography component="span" sx={{ fontSize: '0.6875rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {hint}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

/**
 * What stands between you and the customer, as one figure: what they owe less the advance you hold for them. More
 * owed: Due (red — "Partly paid" when they have paid part); more held: Advance (green). The parts are in the tooltip
 * and on the customer's page. Settled when it comes to nothing; a dash before their first bill.
 */
function BalanceCell({ c }) {
  const advanceHint = [c.advanceLeftPaise > 0 && t('next bills'), c.orderAdvancePaise > 0 && t('orders')].filter(Boolean).join(' + ');
  const net = (c.duePaise ?? 0) - (c.advancePaise ?? 0);
  if (c.duePaise > 0 || c.advancePaise > 0) {
    // Both a due and an advance: say what made up the net figure.
    const parts = c.duePaise > 0 && c.advancePaise > 0 ? t('Due {{due}} − advance {{advance}}', { due: formatINR(c.duePaise, { decimals: 0 }), advance: formatINR(c.advancePaise, { decimals: 0 }) }) : undefined;
    if (net === 0) {
      return (
        <Tooltip title={parts ?? ''}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, color: MONEY_TONE.paid, bgcolor: 'rgba(46, 107, 79, 0.10)' }}>
            <CheckRoundedIcon sx={{ fontSize: 14 }} /> {t('Settled')}
          </Box>
        </Tooltip>
      );
    }
    return (
      <Tooltip title={parts ?? ''}>
        <Box>
          {net > 0 ? (
            <BalanceLine paise={net} tone="due" label={c.paymentStatus === 'partly_paid' ? t('Partly paid') : t('Due')} />
          ) : (
            <BalanceLine paise={-net} tone="paid" label={t('Advance')} hint={advanceHint && t('for {{advanceHint}}', { advanceHint })} />
          )}
        </Box>
      </Tooltip>
    );
  }
  if (c.paymentStatus === 'paid') {
    return (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, color: MONEY_TONE.paid, bgcolor: 'rgba(46, 107, 79, 0.10)' }}>
        <CheckRoundedIcon sx={{ fontSize: 14 }} /> {t('Settled')}
      </Box>
    );
  }
  return (
    <Typography variant="body2" color="textSecondary">
      —
    </Typography>
  );
}

// Filters always show their label on top and a value, so picking one does not shift the layout.
const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

export default function CustomersPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('customer.create');
  const canEdit = usePermission('customer.edit');
  const canCollect = usePermission('accounts.receipt');
  const [collectFor, setCollectFor] = useState(null);
  const editor = useListEditor(useCustomerQuery);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const list = useListParams({ due: '', status: '' });
  const { data, isLoading, isFetching, error, refetch } = useCustomerListQuery(list.params);
  // Which rows can be deleted (Delete stays visible; it is disabled with the reason when not).
  const deleteStatus = useDeleteStatus('customer', data?.items);

  const columns = [
    {
      key: 'name',
      label: t('Customer'),
      render: (c) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: '0.8125rem', fontWeight: 800, color: 'var(--brand-strong)', background: 'linear-gradient(145deg, rgba(var(--brand-rgb), 0.20), rgba(var(--brand-rgb), 0.06))', border: '1px solid rgba(var(--brand-rgb), 0.3)' }}>
            {initialsOf(c.name)}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {c.name}
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.75rem' }}>
              {c.code} · {c.mobile}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'balance', label: t('Balance'), align: 'right', render: (c) => <BalanceCell c={c} /> },
    { key: 'status', label: t('Status'), render: (c) => <StatusChip status={c.status} /> },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: actionsWidth(4),
      render: (c) => (
        <RowActions onView={() => navigate(`/customers/${c.id}`)} onEdit={canEdit ? () => editor.open(c) : undefined} deleteType="customer" deleteStatus={deleteStatus(c.id)} id={c.id} name={c.name}>
          {canCollect && c.duePaise > 0 && (
            <Tooltip title={t('Collect payment ({{due}} due)', { due: formatINR(c.duePaise, { decimals: 0 }) })}>
              <IconButton size="small" color="success" onClick={() => setCollectFor(c.id)} aria-label={t('Collect payment: {{name}}', { name: c.name })}>
                <PaymentsOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </RowActions>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Customers')}
        subtitle={t('Your customers, their contact details and what they owe.')}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawerOpen(true)}>
              {t('New customer')}
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={PeopleAltOutlinedIcon} label={t('Customers')} value={data.meta.summary.total} caption={t('On your books')} />
          <SummaryCard icon={PersonAddAltOutlinedIcon} label={t('New this month')} value={data.meta.summary.newThisMonth} caption={t('Added since the 1st')} tone="blue" />
          <SummaryCard icon={AccountBalanceWalletOutlinedIcon} label={t('Due from customers')} value={formatINR(data.meta.summary.duePaise, { decimals: 0 })} caption={t('Credit on bills + old dues')} tone={data.meta.summary.duePaise ? 'red' : 'green'} valueTone={data.meta.summary.duePaise ? 'due' : 'paid'} />
          <SummaryCard icon={NotificationsActiveOutlinedIcon} label={t('Customers with dues')} value={data.meta.summary.owing} caption={data.meta.summary.owing ? t('Tap to see who owes') : t('Nobody owes')} tone={data.meta.summary.owing ? 'amber' : 'green'} onClick={data.meta.summary.owing ? () => list.setFilter('due', 'due') : undefined} />
        </SummaryCards>
      )}
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={
          list.filtered
            ? { title: t('No matching customers'), description: t('Try another name, mobile or filter.') }
            : { title: t('No customers yet'), description: t('Add your first customer to start building purchase history.') }
        }
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search name, mobile or code')} />
            <TextField select label={t('Due')} value={list.filters.due} onChange={(e) => list.setFilter('due', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 200 }, flexShrink: 0 }}>
              <MenuItem value="">{t('All customers')}</MenuItem>
              <MenuItem value="due">{t('Has due')}</MenuItem>
              <MenuItem value="clear">{t('No due')}</MenuItem>
            </TextField>
            <TextField select label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 150 }, flexShrink: 0 }}>
              <MenuItem value="">{t('All statuses')}</MenuItem>
              <MenuItem value="active">{t('Active')}</MenuItem>
              <MenuItem value="inactive">{t('Inactive')}</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <CustomerFormDrawer open={drawerOpen} customer={null} onClose={() => setDrawerOpen(false)} />
      <CustomerFormDrawer open={Boolean(editor.record)} customer={editor.record} onClose={editor.close} />
      <CollectDueDialog open={Boolean(collectFor)} onClose={() => setCollectFor(null)} customerId={collectFor} />
    </>
  );
}
