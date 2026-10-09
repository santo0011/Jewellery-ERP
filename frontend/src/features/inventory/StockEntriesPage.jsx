import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
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

const PAGES = {
  opening: {
    title: 'Opening stock',
    subtitle: 'Bring draft products and existing bullion, old gold or scrap into stock with a ledger entry.',
    button: 'New opening stock',
    useQuery: useOpeningEntriesQuery,
    empty: 'No opening stock entries yet',
  },
  adjustment: {
    title: 'Stock adjustments',
    subtitle: 'Write-offs and metal corrections. Each one is reviewed before it changes stock.',
    button: 'New adjustment',
    useQuery: useAdjustmentsQuery,
    empty: 'No adjustments yet',
  },
};

export default function StockEntriesPage({ mode }) {
  const page = PAGES[mode];
  const canCreate = usePermission('inventory.adjust');
  const [drawer, setDrawer] = useState(false);
  const [viewing, setViewing] = useState(null);
  const list = useListParams({ status: '' });
  const { data, isLoading, isFetching, error, refetch } = page.useQuery(list.params);

  const columns = [
    {
      key: 'docNo',
      label: 'Document',
      render: (d) => (
        <Box>
          <Typography variant="subtitle2">{d.docNo}</Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDateTime(d.createdAt)}
          </Typography>
        </Box>
      ),
    },
    { key: 'branch', label: 'Branch', render: (d) => d.branch?.name },
    ...(mode === 'adjustment' ? [{ key: 'reason', label: 'Reason', render: (d) => ADJUSTMENT_REASONS.find((r) => r.value === d.reason)?.label }] : []),
    { key: 'contents', label: 'Contents', render: docTotals },
    { key: 'by', label: 'By', render: (d) => d.createdBy?.name },
    { key: 'status', label: 'Status', render: (d) => <DocStatusChip status={d.status} /> },
  ];

  return (
    <>
      <PageHeader
        title={page.title}
        subtitle={page.subtitle}
        breadcrumbs={[{ label: 'Stock' }, { label: page.title }]}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawer(true)}>
              {page.button}
            </Button>
          )
        }
      />
      <DataTable
        columns={[...columns, viewColumn(setViewing, { name: (e) => e.docNo })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filtered ? 'No matching entries' : page.empty }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search document number or note" />
            {mode === 'adjustment' && (
              <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 200 } }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="pending_approval">Awaiting approval</MenuItem>
                <MenuItem value="posted">Posted</MenuItem>
                <MenuItem value="rejected">Rejected</MenuItem>
              </TextField>
            )}
          </Stack>
        }
      />
      <StockEntryDrawer mode={mode} open={drawer} onClose={() => setDrawer(false)} />
      <StockDocDialog doc={viewing} onClose={() => setViewing(null)} />
    </>
  );
}
