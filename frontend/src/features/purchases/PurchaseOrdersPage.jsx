import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Autocomplete, Box, Button, Grid, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { decimalToScaledInt, formatINR, formatWeight, METAL_OPTIONS, PURITIES, toPaise } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import RowActions, { actionsWidth } from '../../components/RowActions.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useSupplierListQuery } from '../suppliers/supplierApi.js';
import { useCreatePurchaseOrderMutation, usePurchaseOrderListQuery } from './purchaseApi.js';
import { OrderStatusChip } from './purchaseUi.jsx';
import ItemPicker from '../items/ItemPicker.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import CurrencyRupeeOutlinedIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import { useDeleteStatus } from '../../services/recordApi.js';
import { t } from '../../i18n/index.js';

const blankLine = () => ({ description: '', itemId: null, metal: 'gold', purity: 916, quantity: '1', weight: '', amount: '' });
const toMg = (v) => {
  try {
    return v ? (decimalToScaledInt(v, 3) ?? 0) : 0;
  } catch {
    return null;
  }
};
const toP = (v) => {
  try {
    return v ? (toPaise(v) ?? 0) : 0;
  } catch {
    return null;
  }
};
const todayIso = () => new Date().toISOString().slice(0, 10);

function NewOrderDrawer({ open, onClose }) {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const { data: suppliers } = useSupplierListQuery({ status: 'active', limit: 100 }, { skip: !open });
  const [create, state] = useCreatePurchaseOrderMutation();
  const [supplier, setSupplier] = useState(null);
  const [branchId, setBranchId] = useState(activeBranchId ?? session.branches[0]?.id ?? '');
  const [expectedDate, setExpectedDate] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  const set = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const estimate = lines.reduce((s, l) => s + (toP(l.amount) ?? 0), 0);

  const submit = async (e) => {
    e?.preventDefault?.();
    setTried(true);
    if (!supplier || lines.some((l) => l.description.trim().length < 2 || toMg(l.weight) === null || toP(l.amount) === null)) return;
    try {
      const order = await create({
        supplierId: supplier.id,
        branchId,
        ...(expectedDate && { expectedDate }),
        lines: lines.map((l) => ({ description: l.description.trim(), ...(l.itemId && { itemId: l.itemId }), metal: l.metal, purity: Number(l.purity), quantity: Math.max(1, Number(l.quantity) || 1), weightMg: toMg(l.weight), amountPaise: toP(l.amount) })),
        note: note.trim() || null,
      }).unwrap();
      toast.success(t('Order {{orderNo}} placed with {{name}}', { orderNo: order.orderNo, name: order.supplier.name }));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer open={open} title={t('New purchase order')} subtitle={t('What you are ordering from a supplier.')} onClose={onClose} onSubmit={submit} submitting={state.isLoading} submitLabel={t('Place order')} width={620}>
      <Stack spacing={2}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Autocomplete
              options={suppliers?.items ?? []}
              value={supplier}
              onChange={(e, v) => setSupplier(v)}
              getOptionLabel={(s) => s.companyName ?? ''}
              isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
              renderInput={(p) => <TextField {...p} label={t('Supplier')} error={tried && !supplier} helperText={tried && !supplier ? t('Pick the supplier') : ' '} />}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label={t('Expected by')} type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayIso() } }} helperText={t('Optional')} />
          </Grid>
          {session.branches.length > 1 && (
            <Grid size={12}>
              <TextField select label={t('For branch')} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                {session.branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}
        </Grid>

        <Typography variant="subtitle2">{t('Items')}</Typography>
        <ItemPicker
          size="small"
          label={t('Add from saved items')}
          helperText={t('Pick a saved item to fill its name, metal and purity — or type the line yourself below.')}
          onPick={(item) =>
            setLines((ls) => {
              const line = { ...blankLine(), description: item.name, itemId: item.id, metal: item.metal, purity: item.purity };
              // Fill the first empty line, otherwise add one.
              const empty = ls.findIndex((l) => !l.description.trim());
              return empty >= 0 ? ls.map((l, j) => (j === empty ? line : l)) : [...ls, line];
            })
          }
        />
        {lines.map((l, i) => (
          <Box key={i} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 7 }}>
                <TextField size="small" label={t('Item')} placeholder={t('e.g. 22K bangles, 2 pairs')} value={l.description} onChange={(e) => set(i, { description: e.target.value, itemId: null })} error={tried && l.description.trim().length < 2} />
              </Grid>
              <Grid size={{ xs: 6, sm: 2.5 }}>
                <TextField
                  size="small"
                  select
                  label={t('Metal')}
                  value={l.metal}
                  onChange={(e) => set(i, { metal: e.target.value, purity: PURITIES[e.target.value]?.[0]?.fineness ?? 0, itemId: null })}
                >
                  {METAL_OPTIONS.map((m) => (
                    <MenuItem key={m.value} value={m.value}>
                      {m.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6, sm: 2.5 }}>
                <TextField size="small" select label={t('Purity')} value={l.purity} onChange={(e) => set(i, { purity: e.target.value, itemId: null })}>
                  {(PURITIES[l.metal] ?? []).map((p) => (
                    <MenuItem key={p.fineness} value={p.fineness}>
                      {p.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 4, sm: 2 }}>
                <TextField size="small" label={t('Qty')} value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value.replace(/\D/g, '') })} />
              </Grid>
              <Grid size={{ xs: 8, sm: 4 }}>
                <TextField size="small" label={t('Approx. weight')} value={l.weight} onChange={(e) => set(i, { weight: e.target.value.replace(/[^\d.]/g, '') })} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> } }} />
              </Grid>
              <Grid size={{ xs: 10, sm: 5 }}>
                <TextField size="small" label={t('Estimated amount')} value={l.amount} onChange={(e) => set(i, { amount: e.target.value.replace(/[^\d.]/g, '') })} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
              </Grid>
              <Grid size={{ xs: 2, sm: 1 }} sx={{ display: 'flex', alignItems: 'center' }}>
                <IconButton size="small" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label={t('Remove line')}>
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Grid>
            </Grid>
          </Box>
        ))}
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Button startIcon={<AddRoundedIcon />} onClick={() => setLines((ls) => [...ls, blankLine()])}>
            {t('Add item')}
          </Button>
          {estimate > 0 && (
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('Estimate {{estimate}}', { estimate: formatINR(estimate, { decimals: 0 }) })}
            </Typography>
          )}
        </Stack>
        <TextField label={t('Note to supplier (optional)')} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300 } }} />
      </Stack>
    </FormDrawer>
  );
}

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('purchase.create');
  const [open, setOpen] = useState(false);
  const list = useListParams({ status: 'open' });
  const { data, isLoading, isFetching, error, refetch } = usePurchaseOrderListQuery(list.params);
  // Which rows can be deleted (Delete stays visible; it is disabled with the reason when not).
  const deleteStatus = useDeleteStatus('purchaseOrder', data?.items);
  const meta = data?.meta;

  const columns = [
    {
      key: 'order',
      label: t('Order'),
      render: (o) => (
        <Box>
          <Typography variant="subtitle2">{o.orderNo}</Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDate(o.orderDate)}
          </Typography>
        </Box>
      ),
    },
    { key: 'supplier', label: t('Supplier'), render: (o) => <Typography variant="body2" sx={{ fontWeight: 500 }}>{o.supplier.name}</Typography> },
    {
      key: 'items',
      label: t('Items'),
      render: (o) => (
        <Box sx={{ maxWidth: 280 }}>
          <Typography variant="body2" noWrap>
            {o.lines.map((l) => l.description).join(', ')}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {t('{{quantity}} pcs', { quantity: o.totals.quantity })}{o.totals.weightMg ? ` · ~${formatWeight(o.totals.weightMg)}` : ''}
          </Typography>
        </Box>
      ),
    },
    { key: 'amount', label: t('Estimate'), align: 'right', render: (o) => (o.totals.amountPaise ? formatINR(o.totals.amountPaise, { decimals: 0 }) : '—') },
    {
      key: 'expected',
      label: t('Expected'),
      render: (o) => (
        <Typography variant="body2" sx={{ color: o.overdue ? 'error.main' : 'text.primary', fontWeight: o.overdue ? 600 : 400 }}>
          {o.expectedDate ? formatDate(o.expectedDate) : '—'}
        </Typography>
      ),
    },
    { key: 'status', label: t('Status'), render: (o) => <OrderStatusChip status={o.status} overdue={o.overdue} /> },
  ];

  return (
    <>
      <PageHeader
        title={t('Purchase orders')}
        subtitle={t('What you have ordered from suppliers and when it is due.')}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>
              {t('New order')}
            </Button>
          )
        }
      />
      <SummaryCards>
        <SummaryCard icon={PendingActionsOutlinedIcon} label={t('Open orders')} value={meta?.open ?? 0} caption={t('Waiting for delivery')} onClick={() => list.setFilter('status', 'open')} />
        <SummaryCard icon={EventBusyOutlinedIcon} label={t('Overdue')} value={meta?.overdue ?? 0} caption={meta?.overdue ? t('Past the expected date') : t('Nothing late')} tone={meta?.overdue ? 'red' : 'green'} valueTone={meta?.overdue ? 'due' : undefined} />
        <SummaryCard icon={CurrencyRupeeOutlinedIcon} label={t('Open order value')} value={formatINR(meta?.openAmountPaise ?? 0, { decimals: 0 })} caption={t('Estimated')} tone="blue" />
      </SummaryCards>
      <DataTable
        columns={[
          ...columns,
          {
            key: 'actions',
            label: t('Action'),
            align: 'right',
            width: actionsWidth(2),
            // An order already received on a bill stays with it.
            render: (o) => <RowActions onView={() => navigate(`/purchases/orders/${o.id}`)} deleteType="purchaseOrder" deleteStatus={deleteStatus(o.id)} id={o.id} name={o.orderNo} />,
          },
        ]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filters.status === 'open' ? { title: t('No open orders'), description: t('Orders you place with suppliers show here until the goods arrive.') } : { title: t('No orders'), description: t('Try another filter.') }}
        pagination={list.pagination(meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search order no., supplier or item')} />
            <ToggleButtonGroup exclusive size="small" value={list.filters.status} onChange={(e, v) => v !== null && list.setFilter('status', v)} sx={{ height: 40, flexShrink: 0 }}>
              <ToggleButton value="open">{t('Open')}</ToggleButton>
              <ToggleButton value="received">{t('Received')}</ToggleButton>
              <ToggleButton value="cancelled">{t('Cancelled')}</ToggleButton>
              <ToggleButton value="">{t('All')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
      />
      {open && <NewOrderDrawer open onClose={() => setOpen(false)} />}
    </>
  );
}
