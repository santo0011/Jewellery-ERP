import { MenuItem, Stack, TextField } from '@mui/material';
import { METAL_OPTIONS, MOVEMENT_TYPE_LABELS } from '@jerp/shared';
import { useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { useStockMovementsQuery } from './inventoryApi.js';
import { MovementDetailsDrawer, movementColumns } from './movements.jsx';

export { movementColumns } from './movements.jsx';

export default function StockLedgerPage() {
  const { data: session } = useSession();
  const [viewing, setViewing] = useState(null);
  const showCost = usePermission('product.viewCost');
  const list = useListParams({ type: '', metal: '', branchId: '', from: '', to: '' });
  const { data, isLoading, isFetching, error, refetch } = useStockMovementsQuery(list.params);
  const set = (key) => (e) => list.setFilter(key, e.target.value);

  return (
    <>
      <PageHeader title="Stock ledger" subtitle="Every stock movement, permanent and in order. Nothing here can be edited or deleted." breadcrumbs={[{ label: 'Stock' }, { label: 'Stock ledger' }]} />
      <DataTable
        columns={movementColumns({ onView: setViewing })}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filtered ? 'No matching movements' : 'No stock movements yet' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField select label="Movement" value={list.filters.type} onChange={set('type')} sx={{ maxWidth: { md: 190 } }}>
              <MenuItem value="">All movements</MenuItem>
              {Object.entries(MOVEMENT_TYPE_LABELS).map(([v, l]) => (
                <MenuItem key={v} value={v}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Metal" value={list.filters.metal} onChange={set('metal')} sx={{ maxWidth: { md: 150 } }}>
              <MenuItem value="">All metals</MenuItem>
              {METAL_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            {session.branches.length > 1 && (
              <TextField select label="Branch" value={list.filters.branchId} onChange={set('branchId')} sx={{ maxWidth: { md: 180 } }}>
                <MenuItem value="">All branches</MenuItem>
                {session.branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField type="date" label="From" value={list.filters.from} onChange={set('from')} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: { md: 170 } }} />
            <TextField type="date" label="To" value={list.filters.to} onChange={set('to')} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: { md: 170 } }} />
          </Stack>
        }
      />
      <MovementDetailsDrawer movement={viewing} onClose={() => setViewing(null)} showCost={showCost} />
    </>
  );
}
