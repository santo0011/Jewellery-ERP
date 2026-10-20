import AddRoundedIcon from '@mui/icons-material/AddRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR, formatWeight } from '@jerp/shared';
import { OLD_GOLD_PAYOUT_MODES } from '@jerp/shared/schemas';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { Link as RouterLink } from 'react-router';
import CustomerPicker from '../../components/CustomerPicker.jsx';
import DataTable from '../../components/DataTable.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import OldGoldLinesEditor, { oldGoldPayload, oldGoldTotal } from './OldGoldLinesEditor.jsx';
import { useBuyOldGoldMutation, useCancelOldGoldMutation, useOldGoldListQuery } from './oldGoldApi.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const PAYOUT_LABEL = { cash: 'Cash', bank: 'Bank transfer', upi: 'UPI' };
const TYPE_LABEL = { exchange: 'Exchange on bill', purchase: 'Bought' };

/** Old gold bought for money: who from, the pieces, and how they were paid. */
function BuyDrawer({ open, onClose }) {
  const { data: session } = useSession();
  const branchId = useSelector((s) => s.auth.activeBranchId) ?? session.branches[0]?.id;
  const branchName = session.branches.find((b) => b.id === branchId)?.name;
  const [customer, setCustomer] = useState(null);
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [buy, { isLoading }] = useBuyOldGoldMutation();
  const lines = oldGoldPayload(rows);
  const total = oldGoldTotal(rows);

  const reset = () => {
    setCustomer(null);
    setRows([]);
    setMode('cash');
    setReference('');
    setNote('');
    setTried(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (!customer || !lines?.length) return;
    try {
      const og = await buy({ branchId, customerId: customer.id, lines, payout: { mode, reference: reference || null }, note: note || null }).unwrap();
      toast.success(`${og.docNo} saved · pay ${customer.name} ${formatINR(og.totalPaise)}`);
      close();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer open={open} title="Buy old gold" subtitle={`${branchName ?? ''} · the metal goes to Raw materials`} onClose={close} onSubmit={submit} submitLabel={total ? `Save · pay ${inr(total)}` : 'Save'} submitting={isLoading} width={640}>
      <Stack spacing={2.5}>
        <CustomerPicker value={customer} onChange={setCustomer} label="Customer (who is selling)" error={tried && !customer} helperText={tried && !customer ? 'Select the customer' : 'Keep their ID on record for old gold you buy.'} />
        <Box>
          <Typography variant="overline" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
            Pieces
          </Typography>
          <OldGoldLinesEditor rows={rows} onChange={setRows} />
          {tried && !lines?.length && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {rows.length ? 'Complete every piece (description, weight and rate).' : 'Add at least one piece.'}
            </Alert>
          )}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField select label="Paid by" value={mode} onChange={(e) => setMode(e.target.value)} sx={{ width: { sm: 200 } }}>
            {OLD_GOLD_PAYOUT_MODES.map((m) => (
              <MenuItem key={m} value={m}>
                {PAYOUT_LABEL[m]}
              </MenuItem>
            ))}
          </TextField>
          {mode !== 'cash' && <TextField label="Reference (UPI / transfer no.)" value={reference} onChange={(e) => setReference(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />}
        </Stack>
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300 } }} />
        {total > 0 && (
          <Stack direction="row" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              To pay the customer
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', fontVariantNumeric: 'tabular-nums' }}>{formatINR(total)}</Typography>
          </Stack>
        )}
      </Stack>
    </FormDrawer>
  );
}

/** One old gold record: its pieces and how it came in; a purchase can be cancelled while its metal is unused. */
function DetailDialog({ record, onClose }) {
  const canCancel = usePermission('oldgold.create');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [cancel, { isLoading }] = useCancelOldGoldMutation();
  const close = () => {
    setCancelling(false);
    setReason('');
    onClose();
  };
  const submit = async () => {
    try {
      await cancel({ id: record.id, reason: reason.trim() }).unwrap();
      toast.success(`${record.docNo} cancelled`);
      close();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <Dialog open={Boolean(record)} onClose={isLoading ? undefined : close} maxWidth="sm" fullWidth>
      {record && (
        <>
          <DialogTitle sx={{ fontWeight: 600 }}>
            {record.docNo}{' '}
            <Chip size="small" label={record.status === 'cancelled' ? 'Cancelled' : TYPE_LABEL[record.type]} color={record.status === 'cancelled' ? 'error' : 'default'} variant="outlined" sx={{ ml: 1, height: 22 }} />
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              {formatDateTime(record.createdAt)} · {record.branch?.name}
              {record.customer ? ` · ${record.customer.name} (${record.customer.mobile})` : ' · Walk-in'}
              {record.createdBy ? ` · by ${record.createdBy.name}` : ''}
            </Typography>
            <Stack divider={<Divider flexItem />} spacing={1.25}>
              {record.lines.map((l, i) => (
                <Stack key={i} direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {l.description}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {purityLabel(l.metal, l.purity)} · {formatWeight(l.grossWeightMg)}
                      {l.lessWeightMg ? ` − ${formatWeight(l.lessWeightMg)} stones` : ''} = {formatWeight(l.netWeightMg)} net · {formatINR(l.ratePerGramPaise, { decimals: 0 })}/g
                      {l.deductionBps ? ` · less ${l.deductionBps / 100}%` : ''}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatINR(l.valuePaise)}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Divider sx={{ my: 1.5 }} />
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 700 }}>Total</Typography>
              <Typography sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatINR(record.totalPaise)}</Typography>
            </Stack>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              {record.sale ? (
                <>
                  Taken off invoice{' '}
                  <Box component={RouterLink} to={`/sales/${record.sale.id}`} sx={{ color: 'inherit', fontWeight: 600 }}>
                    {record.sale.invoiceNo}
                  </Box>
                </>
              ) : (
                `Paid by ${PAYOUT_LABEL[record.payout?.mode] ?? '—'}${record.payout?.reference ? ` (${record.payout.reference})` : ''}`
              )}
              {record.note ? ` · ${record.note}` : ''}
            </Typography>
            {record.status === 'cancelled' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                Cancelled {formatDateTime(record.cancelledAt)}
                {record.cancelledBy ? ` by ${record.cancelledBy.name}` : ''}: {record.cancelReason}
              </Alert>
            )}
            {cancelling && (
              <TextField autoFocus label="Why cancel?" placeholder="e.g. Customer took it back" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 2 }} helperText="The metal is taken back out of Raw materials and the payment is reversed in the books." slotProps={{ htmlInput: { maxLength: 300 } }} />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            {canCancel && record.type === 'purchase' && record.status === 'completed' && !cancelling && (
              <Button color="error" onClick={() => setCancelling(true)} sx={{ mr: 'auto' }}>
                Cancel purchase
              </Button>
            )}
            {cancelling ? (
              <>
                <Button color="secondary" onClick={() => setCancelling(false)} disabled={isLoading}>
                  Keep it
                </Button>
                <Button variant="contained" color="error" onClick={submit} disabled={reason.trim().length < 5} loading={isLoading}>
                  Cancel purchase
                </Button>
              </>
            ) : (
              <Button onClick={close}>Close</Button>
            )}
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export default function OldGoldPage() {
  const canBuy = usePermission('oldgold.create');
  const list = useListParams({ type: '', status: '' });
  const { data, isLoading, isFetching, error, refetch } = useOldGoldListQuery(list.params);
  const [buying, setBuying] = useState(false);
  const [viewing, setViewing] = useState(null);
  const s = data?.meta?.summary;

  const columns = [
    {
      key: 'doc',
      label: 'Date',
      render: (d) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatDate(d.businessDate)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {d.docNo}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      wide: true,
      render: (d) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>
            {d.customer?.name ?? 'Walk-in'}
          </Typography>
          <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block', maxWidth: 260 }}>
            {d.lines.map((l) => l.description).join(', ')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'type',
      label: 'How',
      render: (d) =>
        d.status === 'cancelled' ? (
          <Chip size="small" label="Cancelled" color="error" variant="outlined" sx={{ height: 22 }} />
        ) : (
          <Box>
            <Chip size="small" label={TYPE_LABEL[d.type]} sx={{ height: 22, fontWeight: 600, ...(d.type === 'exchange' && { bgcolor: 'rgba(var(--brand-rgb), 0.12)', color: 'var(--brand-strong)' }) }} />
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.25 }}>
              {d.sale ? d.sale.invoiceNo : PAYOUT_LABEL[d.payout?.mode]}
            </Typography>
          </Box>
        ),
    },
    {
      key: 'weight',
      label: 'Net weight',
      align: 'right',
      render: (d) => <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatWeight(d.lines.reduce((t, l) => t + l.netWeightMg, 0))}</Typography>,
    },
    {
      key: 'value',
      label: 'Value',
      align: 'right',
      render: (d) => (
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', ...(d.status === 'cancelled' && { textDecoration: 'line-through', color: 'text.disabled' }) }}>
          {inr(d.totalPaise)}
        </Typography>
      ),
    },
    { key: 'actions', label: 'Action', align: 'right', width: 96, render: (d) => <ViewButton onClick={() => setViewing(d)} /> },
  ];

  return (
    <>
      <PageHeader
        title="Old gold"
        subtitle="Old gold taken in exchange on bills, or bought from customers. The metal goes to Raw materials."
        actions={
          canBuy && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setBuying(true)}>
              Buy old gold
            </Button>
          )
        }
      />
      {s && (
        <SummaryCards>
          <SummaryCard icon={PaymentsOutlinedIcon} label="This month" value={inr(s.totalPaise)} caption={`${s.count} record${s.count === 1 ? '' : 's'}`} tone="gold" hideCaptionOnPhone={false} />
          <SummaryCard icon={ReceiptLongOutlinedIcon} label="On bills / bought" value={inr(s.exchangePaise)} caption={`Bought for money: ${inr(s.purchasePaise)}`} tone="blue" hideCaptionOnPhone={false} />
          <SummaryCard icon={ScaleOutlinedIcon} label="Fine gold in" value={formatWeight(s.goldFineMg)} caption={s.silverFineMg ? `Fine silver: ${formatWeight(s.silverFineMg)}` : 'This month'} tone="amber" hideCaptionOnPhone={false} />
        </SummaryCards>
      )}
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered ? { title: 'No old gold matches', description: 'Try another search or filter.' } : { title: 'No old gold yet', description: 'Take old gold in exchange on New bill, or buy it here.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search no., invoice, customer or mobile" />
            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
              <TextField select label="How" value={list.filters.type} onChange={(e) => list.setFilter('type', e.target.value)} sx={{ width: { xs: '50%', md: 180 } }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="exchange">Exchange on bill</MenuItem>
                <MenuItem value="purchase">Bought</MenuItem>
              </TextField>
              <TextField select label="Show" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ width: { xs: '50%', md: 140 } }}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </TextField>
            </Stack>
          </Stack>
        }
      />
      {canBuy && <BuyDrawer open={buying} onClose={() => setBuying(false)} />}
      <DetailDialog record={viewing && (data?.items?.find((d) => d.id === viewing.id) ?? viewing)} onClose={() => setViewing(null)} />
    </>
  );
}
