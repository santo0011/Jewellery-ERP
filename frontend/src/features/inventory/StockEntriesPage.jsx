import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { ADJUSTMENT_REASONS } from '@jerp/shared';
import { useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDateTime } from '../../utils/format.js';
import { useAdjustmentsQuery, useOpeningEntriesQuery } from './inventoryApi.js';
import StockDocDialog from './StockDocDialog.jsx';
import StockEntryDrawer from './StockEntryDrawer.jsx';
import { DocStatusChip, docTotals } from './stockUi.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { t } from '../../i18n/index.js';

const PAGES = {
  opening: {
    title: t('Opening stock'),
    subtitle: t('Bring draft products and existing bullion, old gold or scrap into stock with a ledger entry.'),
    button: t('New opening stock'),
    useQuery: useOpeningEntriesQuery,
    empty: t('No opening stock entries yet'),
  },
  adjustment: {
    title: t('Stock adjustments'),
    subtitle: t('Write-offs and metal corrections. Each one is reviewed before it changes stock.'),
    button: t('New adjustment'),
    useQuery: useAdjustmentsQuery,
    empty: t('No adjustments yet'),
  },
};

export default function StockEntriesPage({ mode }) {
  const page = PAGES[mode];
  const canCreate = usePermission('inventory.adjust');
  const [drawer, setDrawer] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const list = useListParams({ status: '' });
  const { data, isLoading, isFetching, error, refetch } = page.useQuery(list.params);

  const columns = [
    {
      key: 'docNo',
      label: t('Document'),
      render: (d) => (
        <Box>
          <Typography variant="subtitle2">{d.docNo}</Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDateTime(d.createdAt)}
          </Typography>
        </Box>
      ),
    },
    { key: 'branch', label: t('Branch'), render: (d) => d.branch?.name },
    ...(mode === 'adjustment' ? [{ key: 'reason', label: t('Reason'), render: (d) => ADJUSTMENT_REASONS.find((r) => r.value === d.reason)?.label }] : []),
    { key: 'contents', label: t('Contents'), render: docTotals },
    { key: 'by', label: t('By'), render: (d) => d.createdBy?.name },
    { key: 'status', label: t('Status'), render: (d) => <DocStatusChip status={d.status} /> },
    // Gold-only opening entries can be corrected until the gold is used; otherwise the button says why not.
    ...(mode === 'opening' && canCreate
      ? [
          {
            key: 'edit',
            label: '',
            align: 'right',
            width: 56,
            render: (d) => (
              <Tooltip title={d.edit?.allowed ? t('Edit') : t(d.edit?.reason ?? 'Cannot be edited')}>
                <span>
                  <IconButton size="small" disabled={!d.edit?.allowed} onClick={() => setEditingId(d.id)} aria-label={t('Edit {{name}}', { name: d.docNo })}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={page.title}
        subtitle={page.subtitle}
        breadcrumbs={[{ label: t('Stock') }, { label: page.title }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawer(true)}>
              {page.button}
            </Button>
          )
        }
      />
      <DataTable
        columns={[...columns, viewColumn(setViewing, { name: (e) => e.docNo, deleteDisabled: t('Stock entries are part of the stock ledger and cannot be deleted. Make a correcting entry instead.') })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filtered ? t('No matching entries') : page.empty }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search document number or note')} />
            {mode === 'adjustment' && (
              <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 200 } }}>
                <MenuItem value="">{t('All')}</MenuItem>
                <MenuItem value="pending_approval">{t('Awaiting approval')}</MenuItem>
                <MenuItem value="posted">{t('Posted')}</MenuItem>
                <MenuItem value="rejected">{t('Rejected')}</MenuItem>
              </TextField>
            )}
          </Stack>
        }
      />
      <StockEntryDrawer mode={mode} open={drawer} onClose={() => setDrawer(false)} />
      <StockEntryDrawer mode={mode} editId={editingId} open={Boolean(editingId)} onClose={() => setEditingId(null)} />
      <StockDocDialog doc={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
