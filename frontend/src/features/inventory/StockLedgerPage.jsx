import { MenuItem, Stack, TextField } from '@mui/material';
import { METAL_OPTIONS, MOVEMENT_TYPE_LABELS } from '@jerp/shared';
import { useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { useStockMovementsQuery } from './inventoryApi.js';
import { MovementDetailsDrawer, movementColumns } from './movements.jsx';
import { t } from '../../i18n/index.js';

export { movementColumns } from './movements.jsx';

export default function StockLedgerPage() {
  const [viewing, setViewing] = useState(null);
  const showCost = usePermission('product.viewCost');
  // Branch follows the navbar branch filter.
  const list = useListParams({ type: '', metal: '', from: '', to: '' });
  const { data, isLoading, isFetching, error, refetch } = useStockMovementsQuery(list.params);
  const set = (key) => (e) => list.setFilter(key, e.target.value);

  return (
    <>
      <PageHeader title={t('Stock ledger')} subtitle={t('Every stock movement, permanent and in order. Nothing here can be edited or deleted.')} breadcrumbs={[{ label: t('Stock') }, { label: t('Stock ledger') }]} />
      <DataTable
        columns={movementColumns({ onView: setViewing })}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filtered ? t('No matching movements') : t('No stock movements yet') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Movement')} value={list.filters.type} onChange={set('type')} sx={{ maxWidth: { md: 190 } }}>
              <MenuItem value="">{t('All movements')}</MenuItem>
              {Object.entries(MOVEMENT_TYPE_LABELS).map(([v, l]) => (
                <MenuItem key={v} value={v}>
                  {l}
                </MenuItem>
              ))}
            </TextField>
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Metal')} value={list.filters.metal} onChange={set('metal')} sx={{ maxWidth: { md: 150 } }}>
              <MenuItem value="">{t('All metals')}</MenuItem>
              {METAL_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField type="date" label={t('From')} value={list.filters.from} onChange={set('from')} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: { md: 170 } }} />
            <TextField type="date" label={t('To')} value={list.filters.to} onChange={set('to')} slotProps={{ inputLabel: { shrink: true } }} sx={{ maxWidth: { md: 170 } }} />
          </Stack>
        }
      />
      <MovementDetailsDrawer movement={viewing} onClose={() => setViewing(null)} showCost={showCost} />
    </>
  );
}
