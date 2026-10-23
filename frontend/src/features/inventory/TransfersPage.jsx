import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Alert, Box, Button, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import DataTable from '../../components/DataTable.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { useBranchDirectoryQuery } from '../branches/branchApi.js';
import { useCreateTransferMutation, useReceiveTransferMutation, useRejectTransferMutation, useTransfersQuery } from './inventoryApi.js';
import ProductPicker, { SelectedProducts } from './ProductPicker.jsx';
import StockDocDialog from './StockDocDialog.jsx';
import { DocStatusChip, docTotals } from './stockUi.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { t } from '../../i18n/index.js';

function NewTransferDrawer({ open, onClose }) {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const { data: directory = [] } = useBranchDirectoryQuery(undefined, { skip: !open });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [products, setProducts] = useState([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);
  const [create, { isLoading }] = useCreateTransferMutation();

  const destinations = directory.map((b) => ({ id: String(b.id), name: b.name })).filter((b) => b.id !== from);

  useEffect(() => {
    if (!open) return;
    setFrom(activeBranchId ?? session.branches[0]?.id ?? '');
    setTo('');
    setProducts([]);
    setNote('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!to) return setError('Choose the destination branch');
    if (!products.length) return setError('Add at least one item');
    try {
      const transfer = await create({ fromBranchId: from, toBranchId: to, productIds: products.map((p) => p.id), note: note.trim() || undefined }).unwrap();
      toast.success(t('{{docNo}} dispatched', { docNo: transfer.docNo }));
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
    return undefined;
  };

  return (
    <FormDrawer open={open} title={t('New transfer')} subtitle={t('Items stay \'in transit\' until the receiving branch accepts them.')} onClose={onClose} onSubmit={submit} submitting={isLoading} submitLabel={t('Dispatch')} width={680}>
      <Grid container spacing={2}>
        {error && (
          <Grid size={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            label={t('From')}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setProducts([]);
            }}
          >
            {session.branches.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label={t('To')} value={to} onChange={(e) => setTo(e.target.value)}>
            {destinations.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={12}>
          <ProductPicker status="in_stock" branchId={from} selected={products} onAdd={(p) => setProducts((l) => [...l, p])} />
        </Grid>
        <Grid size={12}>
          <SelectedProducts products={products} onRemove={(id) => setProducts((l) => l.filter((p) => p.id !== id))} />
        </Grid>
        <Grid size={12}>
          <TextField label={t('Note')} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('e.g. Sent with Rakesh, sealed bag #12')} />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}

export default function TransfersPage() {
  const canTransfer = usePermission('inventory.transfer');
  const [drawer, setDrawer] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const list = useListParams({ status: '' });
  const { data, isLoading, isFetching, error, refetch } = useTransfersQuery(list.params);
  const [receive, receiveState] = useReceiveTransferMutation();
  const [reject, rejectState] = useRejectTransferMutation();

  const act = async (fn, message) => {
    try {
      await fn().unwrap();
      toast.success(message);
      setViewing(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns = [
    {
      key: 'docNo',
      label: t('Transfer'),
      render: (transfer) => (
        <Box>
          <Typography variant="subtitle2">{transfer.docNo}</Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDateTime(transfer.dispatchedAt)}
          </Typography>
        </Box>
      ),
    },
    { key: 'route', label: t('Route'), render: (transfer) => `${transfer.fromBranch?.name} → ${transfer.toBranch?.name}` },
    { key: 'contents', label: t('Contents'), render: docTotals },
    { key: 'by', label: t('Sent by'), render: (transfer) => transfer.dispatchedBy?.name },
    { key: 'status', label: t('Status'), render: (transfer) => <DocStatusChip status={transfer.status} /> },
  ];

  const actions =
    viewing?.canReceive && canTransfer ? (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mr: 'auto', alignItems: { sm: 'center' }, width: { xs: '100%', sm: 'auto' } }}>
        <TextField size="small" placeholder={t('Reason if rejecting')} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} sx={{ minWidth: 220 }} />
        <Button color="error" disabled={rejectReason.trim().length < 3} loading={rejectState.isLoading} onClick={() => act(() => reject({ id: viewing.id, reason: rejectReason.trim() }), t('Transfer rejected; items returned'))}>
          {t('Reject')}
        </Button>
        <Button variant="contained" loading={receiveState.isLoading} onClick={() => act(() => receive(viewing.id), t('Items received into stock'))}>
          {t('Receive all')}
        </Button>
      </Stack>
    ) : null;

  return (
    <>
      <PageHeader
        title={t('Branch transfers')}
        subtitle={t('Move stock between branches with a dispatch and receive trail.')}
        breadcrumbs={[{ label: t('Stock') }, { label: t('Transfers') }]}
        actions={
          canTransfer && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawer(true)}>
              {t('New transfer')}
            </Button>
          )
        }
      />
      <DataTable
        columns={[
          ...columns,
          viewColumn(
            (transfer) => {
              setRejectReason('');
              setViewing(transfer);
            },
            { name: (transfer) => transfer.docNo, deleteDisabled: t('Transfers are part of the stock ledger and cannot be deleted. Reject or receive them instead.') },
          ),
        ]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filtered ? t('No matching transfers') : t('No transfers yet'), description: t('Transfers need at least two branches.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search transfer number or note')} />
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 180 } }}>
              <MenuItem value="">{t('All')}</MenuItem>
              <MenuItem value="in_transit">{t('In transit')}</MenuItem>
              <MenuItem value="received">{t('Received')}</MenuItem>
              <MenuItem value="rejected">{t('Rejected')}</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <NewTransferDrawer open={drawer} onClose={() => setDrawer(false)} />
      <StockDocDialog doc={viewing} onClose={() => setViewing(null)} actions={actions} />
    </>
  );
}
