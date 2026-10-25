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
import { t } from '../../i18n/index.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const PAYOUT_LABEL = { cash: t('Cash'), bank: t('Bank transfer'), upi: 'UPI' };
const TYPE_LABEL = { exchange: t('Exchange on bill'), purchase: t('Bought') };

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
      toast.success(t('{{docNo}} saved · pay {{name}} {{total}}', { docNo: og.docNo, name: customer.name, total: formatINR(og.totalPaise) }));
      close();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer open={open} title={t('Buy old gold')} subtitle={t('{{value}} · the metal goes to Raw materials', { value: branchName ?? '' })} onClose={close} onSubmit={submit} submitLabel={total ? t('Save · pay {{inr}}', { inr: inr(total) }) : t('Save')} submitting={isLoading} width={640}>
      <Stack spacing={2.5}>
        <CustomerPicker value={customer} onChange={setCustomer} label={t('Customer (who is selling)')} error={tried && !customer} helperText={tried && !customer ? t('Select the customer') : t('Keep their ID on record for old gold you buy.')} />
        <Box>
          <Typography variant="overline" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
            {t('Pieces')}
          </Typography>
          <OldGoldLinesEditor rows={rows} onChange={setRows} />
          {tried && !lines?.length && (
            <Alert severity="warning" sx={{ mt: 1.5 }}>
              {rows.length ? t('Complete every piece (description, weight and rate).') : t('Add at least one piece.')}
            </Alert>
          )}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
          <TextField select label={t('Paid by')} value={mode} onChange={(e) => setMode(e.target.value)} sx={{ width: { sm: 200 } }}>
            {OLD_GOLD_PAYOUT_MODES.map((m) => (
              <MenuItem key={m} value={m}>
                {PAYOUT_LABEL[m]}
              </MenuItem>
            ))}
          </TextField>
          {mode !== 'cash' && <TextField label={t('Reference (UPI / transfer no.)')} value={reference} onChange={(e) => setReference(e.target.value)} slotProps={{ htmlInput: { maxLength: 60 } }} />}
        </Stack>
        <TextField label={t('Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} slotProps={{ htmlInput: { maxLength: 300 } }} />
        {total > 0 && (
          <Stack direction="row" sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('To pay the customer')}
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
      toast.success(t('{{docNo}} cancelled', { docNo: record.docNo }));
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
            <Chip size="small" label={record.status === 'cancelled' ? t('Cancelled') : TYPE_LABEL[record.type]} color={record.status === 'cancelled' ? 'error' : 'default'} variant="outlined" sx={{ ml: 1, height: 22 }} />
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              {formatDateTime(record.createdAt)} · {record.branch?.name}
              {record.customer ? ` · ${record.customer.name} (${record.customer.mobile})` : t(' · Walk-in')}
              {record.createdBy ? t(' · by {{name}}', { name: record.createdBy.name }) : ''}
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
                      {l.lessWeightMg ? t(' − {{lessWeight}} stones', { lessWeight: formatWeight(l.lessWeightMg) }) : ''} {t('= {{netWeight}} net · {{ratePerGram}}/g', { netWeight: formatWeight(l.netWeightMg), ratePerGram: formatINR(l.ratePerGramPaise, { decimals: 0 }) })}
                      {l.deductionBps ? t(' · less {{value}}%', { value: l.deductionBps / 100 }) : ''}
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
              <Typography sx={{ fontWeight: 700 }}>{t('Total')}</Typography>
              <Typography sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatINR(record.totalPaise)}</Typography>
            </Stack>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              {record.sale ? (
                <>
                  {t('Taken off invoice')}{' '}
                  <Box component={RouterLink} to={`/sales/${record.sale.id}`} sx={{ color: 'inherit', fontWeight: 600 }}>
                    {record.sale.invoiceNo}
                  </Box>
                </>
              ) : (
                t('Paid by {{value}}{{value2}}', { value: PAYOUT_LABEL[record.payout?.mode] ?? '—', value2: record.payout?.reference ? ` (${record.payout.reference})` : '' })
              )}
              {record.note ? ` · ${record.note}` : ''}
            </Typography>
            {record.status === 'cancelled' && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {t('Cancelled {{cancelledAt}}', { cancelledAt: formatDateTime(record.cancelledAt) })}
                {record.cancelledBy ? t(' by {{name}}', { name: record.cancelledBy.name }) : ''}: {record.cancelReason}
              </Alert>
            )}
            {cancelling && (
              <TextField autoFocus label={t('Why cancel?')} placeholder={t('e.g. Customer took it back')} value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 2 }} helperText={t('The metal is taken back out of Raw materials and the payment is reversed in the books.')} slotProps={{ htmlInput: { maxLength: 300 } }} />
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            {canCancel && record.type === 'purchase' && record.status === 'completed' && !cancelling && (
              <Button color="error" onClick={() => setCancelling(true)} sx={{ mr: 'auto' }}>
                {t('Cancel purchase')}
              </Button>
            )}
            {cancelling ? (
              <>
                <Button color="secondary" onClick={() => setCancelling(false)} disabled={isLoading}>
                  {t('Keep it')}
                </Button>
                <Button variant="contained" color="error" onClick={submit} disabled={reason.trim().length < 5} loading={isLoading}>
                  {t('Cancel purchase')}
                </Button>
              </>
            ) : (
              <Button onClick={close}>{t('Close')}</Button>
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
      label: t('Date'),
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
      label: t('Customer'),
      wide: true,
      render: (d) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ maxWidth: 260 }}>
            {d.customer?.name ?? t('Walk-in')}
          </Typography>
          <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block', maxWidth: 260 }}>
            {d.lines.map((l) => l.description).join(', ')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'type',
      label: t('How'),
      render: (d) =>
        d.status === 'cancelled' ? (
          <Chip size="small" label={t('Cancelled')} color="error" variant="outlined" sx={{ height: 22 }} />
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
      label: t('Net weight'),
      align: 'right',
      render: (d) => <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatWeight(d.lines.reduce((acc, l) => acc + l.netWeightMg, 0))}</Typography>,
    },
    {
      key: 'value',
      label: t('Value'),
      align: 'right',
      render: (d) => (
        <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', ...(d.status === 'cancelled' && { textDecoration: 'line-through', color: 'text.disabled' }) }}>
          {inr(d.totalPaise)}
        </Typography>
      ),
    },
    { key: 'actions', label: t('Action'), align: 'right', width: 96, render: (d) => <ViewButton onClick={() => setViewing(d)} /> },
  ];

  return (
    <>
      <PageHeader
        title={t('Old gold')}
        subtitle={t('Old gold taken in exchange on bills, or bought from customers. The metal goes to Raw materials.')}
        actions={
          canBuy && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setBuying(true)}>
              {t('Buy old gold')}
            </Button>
          )
        }
      />
      {s && (
        <SummaryCards>
          <SummaryCard icon={PaymentsOutlinedIcon} label={t('This month')} value={inr(s.totalPaise)} caption={(s.count === 1 ? t('{{count}} record', { count: s.count }) : t('{{count}} records', { count: s.count }))} tone="gold" hideCaptionOnPhone={false} />
          <SummaryCard icon={ReceiptLongOutlinedIcon} label={t('On bills / bought')} value={inr(s.exchangePaise)} caption={t('Bought for money: {{inr}}', { inr: inr(s.purchasePaise) })} tone="blue" hideCaptionOnPhone={false} />
          <SummaryCard icon={ScaleOutlinedIcon} label={t('Fine gold in')} value={formatWeight(s.goldFineMg)} caption={s.silverFineMg ? t('Fine silver: {{silverFine}}', { silverFine: formatWeight(s.silverFineMg) }) : t('This month')} tone="amber" hideCaptionOnPhone={false} />
        </SummaryCards>
      )}
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered ? { title: t('No old gold matches'), description: t('Try another search or filter.') } : { title: t('No old gold yet'), description: t('Take old gold in exchange on New bill, or buy it here.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search no., invoice, customer or mobile')} />
            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
              <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('How')} value={list.filters.type} onChange={(e) => list.setFilter('type', e.target.value)} sx={{ width: { xs: '50%', md: 180 } }}>
                <MenuItem value="">{t('All')}</MenuItem>
                <MenuItem value="exchange">{t('Exchange on bill')}</MenuItem>
                <MenuItem value="purchase">{t('Bought')}</MenuItem>
              </TextField>
              <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Show')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ width: { xs: '50%', md: 140 } }}>
                <MenuItem value="">{t('All')}</MenuItem>
                <MenuItem value="completed">{t('Completed')}</MenuItem>
                <MenuItem value="cancelled">{t('Cancelled')}</MenuItem>
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
