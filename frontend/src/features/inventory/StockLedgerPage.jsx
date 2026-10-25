import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import NorthEastRoundedIcon from '@mui/icons-material/NorthEastRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import SouthWestRoundedIcon from '@mui/icons-material/SouthWestRounded';
import { MenuItem, Stack, TextField } from '@mui/material';
import { formatINR, formatWeight, METAL_OPTIONS, MOVEMENT_TYPE_LABELS } from '@jerp/shared';
import { useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
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
  const summary = data?.meta?.summary;
  // "12 entries · 5 pcs": how many movements, and how many of them were pieces.
  const inOut = (s) => [t('{{count}} entries', { count: s.count }), s.pieces ? t('{{pieces}} pcs', { pieces: s.pieces }) : null].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader title={t('Stock ledger')} subtitle={t('Every stock movement, permanent and in order. Nothing here can be edited or deleted.')} breadcrumbs={[{ label: t('Stock') }, { label: t('Stock ledger') }]} />
      {/* Four totals for the movements in the table: they follow the same filters (type, metal, dates, branch).
          The fourth card is net value for users who may see cost, otherwise the movement count. */}
      {summary && (
        <SummaryCards>
          <SummaryCard icon={SouthWestRoundedIcon} label={t('Stock in')} value={formatWeight(summary.in.grossMg)} caption={inOut(summary.in)} tone="green" valueTone="paid" />
          <SummaryCard icon={NorthEastRoundedIcon} label={t('Stock out')} value={formatWeight(summary.out.grossMg)} caption={inOut(summary.out)} tone="red" valueTone="due" />
          <SummaryCard icon={ScaleOutlinedIcon} label={t('Net change')} value={`${summary.netGrossMg < 0 ? '−' : '+'}${formatWeight(Math.abs(summary.netGrossMg))}`} caption={t('{{fine}} fine', { fine: formatWeight(summary.netFineMg) })} tone="gold" />
          {showCost && summary.netValuePaise != null ? (
            <SummaryCard icon={CurrencyRupeeRoundedIcon} label={t('Net value')} value={`${summary.netValuePaise < 0 ? '−' : ''}${formatINR(Math.abs(summary.netValuePaise), { decimals: 0 })}`} caption={t('In {{in}} · out {{out}}', { in: formatINR(summary.in.valuePaise, { decimals: 0 }), out: formatINR(summary.out.valuePaise, { decimals: 0 }) })} tone="amber" />
          ) : (
            <SummaryCard icon={ReceiptLongOutlinedIcon} label={t('Movements')} value={(summary.in.count + summary.out.count).toLocaleString('en-IN')} caption={list.filtered ? t('Matching the filters') : t('All time')} tone="blue" />
          )}
        </SummaryCards>
      )}
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
