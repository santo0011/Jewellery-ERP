import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ToggleOffOutlinedIcon from '@mui/icons-material/ToggleOffOutlined';
import ToggleOnOutlinedIcon from '@mui/icons-material/ToggleOnOutlined';
import { Box, Button, Chip, IconButton, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { formatINR, formatWeight } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import ItemFormDrawer from './ItemFormDrawer.jsx';
import { useItemListQuery, useSetItemStatusMutation } from './itemApi.js';

/** "8%", "0.250 g", "₹500/g", "12%", "₹1,500 per piece" */
export const wastageText = (w) => (!w || w.mode === 'none' ? 'None' : w.mode === 'weight' ? formatWeight(w.value) : `${w.value / 100}%`);
export const makingText = (m) => (!m ? '—' : m.type === 'percent' ? `${m.value / 100}%` : m.type === 'per_gram' ? `${formatINR(m.value, { decimals: 0 })}/g` : `${formatINR(m.value, { decimals: 0 })} per piece`);

export default function ItemsPage() {
  const canEdit = usePermission(['purchase.create', 'product.create']);
  const [editing, setEditing] = useState(null); // null | 'new' | item
  const list = useListParams({ status: 'active' });
  const { data, isLoading, isFetching, error, refetch } = useItemListQuery(list.params);
  const [setStatus] = useSetItemStatusMutation();
  const summary = data?.meta?.summary;

  const toggle = async (i) => {
    const status = i.status === 'active' ? 'inactive' : 'active';
    try {
      await setStatus({ id: i.id, status }).unwrap();
      toast.success(`${i.name} ${status === 'active' ? 'activated' : 'deactivated'}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Item',
      render: (i) => (
        <Box>
          <Typography variant="subtitle2">{i.name}</Typography>
          <Typography variant="caption" color="textSecondary">
            {i.code}
            {i.description ? ` · ${i.description}` : ''}
          </Typography>
        </Box>
      ),
    },
    { key: 'cat', label: 'Category', render: (i) => <Typography variant="body2">{i.category?.name ?? '—'}<Typography component="span" variant="caption" color="textSecondary">{` · ${i.jewelleryTypeLabel}`}</Typography></Typography> },
    { key: 'purity', label: 'Purity', render: (i) => <Chip size="small" label={i.purityLabel} sx={{ height: 22, fontWeight: 600 }} /> },
    { key: 'charges', label: 'Wastage · Making', render: (i) => `${wastageText(i.wastage)} · ${makingText(i.making)}` },
    { key: 'used', label: 'Used', align: 'right', render: (i) => (i.usedCount ? `${i.usedCount} pcs` : '—') },
    { key: 'status', label: 'Status', render: (i) => <StatusChip status={i.status} /> },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 96,
      render: (i) =>
        canEdit && (
          <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={i.status === 'active' ? 'Deactivate — hide from search' : 'Activate'}>
              <IconButton size="small" onClick={() => toggle(i)} aria-label={`${i.status === 'active' ? 'Deactivate' : 'Activate'} ${i.name}`}>
                {i.status === 'active' ? <ToggleOnOutlinedIcon fontSize="small" color="success" /> : <ToggleOffOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Items"
        subtitle="Save each design once — then just pick it on purchases and orders."
        actions={
          canEdit && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setEditing('new')}>
              New item
            </Button>
          )
        }
      />
      {summary && (
        <SummaryCards>
          <SummaryCard icon={CategoryOutlinedIcon} label="Saved items" value={summary.total} caption="In your catalogue" />
          <SummaryCard icon={CheckCircleOutlineRoundedIcon} label="Active" value={summary.active} caption="Shown when searching" tone="green" onClick={() => list.setFilter('status', 'active')} />
          <SummaryCard icon={ToggleOffOutlinedIcon} label="Inactive" value={summary.total - summary.active} caption="Hidden from search" tone="grey" onClick={() => list.setFilter('status', 'inactive')} />
        </SummaryCards>
      )}
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.search ? { title: 'No item found', description: 'Try another name, or add it as a new item.' } : { title: 'No items yet', description: 'Add the designs you buy often — a ring, a chain, a pair of bangles — with their purity and charges.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search name, code or HSN" />
            <ToggleButtonGroup exclusive size="small" value={list.filters.status} onChange={(e, v) => v !== null && list.setFilter('status', v)} sx={{ height: 40, flexShrink: 0 }}>
              <ToggleButton value="active">Active</ToggleButton>
              <ToggleButton value="inactive">Inactive</ToggleButton>
              <ToggleButton value="">All</ToggleButton>
            </ToggleButtonGroup>
            {canEdit && list.search && data?.items?.length === 0 && (
              <Button startIcon={<AddRoundedIcon />} onClick={() => setEditing({ __new: list.search })} sx={{ flexShrink: 0 }}>
                Add “{list.search}”
              </Button>
            )}
          </Stack>
        }
      />
      <ItemFormDrawer
        open={Boolean(editing)}
        item={editing && editing !== 'new' && !editing.__new ? editing : null}
        defaultName={editing?.__new ?? ''}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
