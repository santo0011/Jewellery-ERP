import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Link, Stack, TextField, Typography } from '@mui/material';
import { formatINR, formatWeight } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { purityLabel } from '../products/productForm.js';
import { useCancelPurchaseOrderMutation, usePurchaseOrderQuery } from './purchaseApi.js';
import { OrderStatusChip } from './purchaseUi.jsx';

const STEP_COLOR = { open: 'info.main', received: 'success.main', cancelled: 'text.disabled' };
const STEP_LABEL = { open: 'Ordered', received: 'Received', cancelled: 'Cancelled' };

export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: o, isLoading, error, refetch } = usePurchaseOrderQuery(id);
  const canReceive = usePermission('purchase.create');
  const canCancel = usePermission('purchase.cancel');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [cancel, cancelState] = useCancelPurchaseOrderMutation();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const open = o.status === 'open';

  const doCancel = async () => {
    try {
      await cancel({ id, reason: reason.trim() }).unwrap();
      toast.success(`Order ${o.orderNo} cancelled`);
      setCancelling(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={`Order ${o.orderNo}`}
        subtitle={`${o.supplier.name} · ordered ${formatDate(o.orderDate)}${o.branch ? ` · for ${o.branch.name}` : ''}`}
        back={{ to: '/purchases/orders', label: 'Purchase orders' }}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <OrderStatusChip status={o.status} overdue={o.overdue} />
            {open && canCancel && (
              <Button color="error" startIcon={<CancelOutlinedIcon />} onClick={() => setCancelling(true)}>
                Cancel order
              </Button>
            )}
            {open && canReceive && (
              <Button variant="contained" startIcon={<Inventory2OutlinedIcon />} onClick={() => navigate(`/purchases/new?orderId=${o.id}`)}>
                Goods arrived — enter bill
              </Button>
            )}
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <DataTable
            columns={[
              { key: 'item', label: 'Item', render: (l) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{l.description}</Typography> },
              { key: 'purity', label: 'Purity', render: (l) => purityLabel(l.metal, l.purity) },
              { key: 'qty', label: 'Qty', align: 'right', render: (l) => l.quantity },
              { key: 'wt', label: 'Approx. weight', align: 'right', render: (l) => (l.weightMg ? formatWeight(l.weightMg) : '—') },
              { key: 'amt', label: 'Estimate', align: 'right', render: (l) => (l.amountPaise ? formatINR(l.amountPaise, { decimals: 0 }) : '—') },
            ]}
            rows={o.lines.map((l, i) => ({ ...l, rowKey: i }))}
            getRowId={(l) => l.rowKey}
          />
          <Stack direction="row" spacing={3} sx={{ mt: 1.5, px: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2">
              <strong>{o.totals.quantity}</strong> pcs
            </Typography>
            {o.totals.weightMg > 0 && (
              <Typography variant="body2">
                ~<strong>{formatWeight(o.totals.weightMg)}</strong>
              </Typography>
            )}
            {o.totals.amountPaise > 0 && (
              <Typography variant="body2">
                Estimate <strong>{formatINR(o.totals.amountPaise, { decimals: 0 })}</strong>
              </Typography>
            )}
          </Stack>
          {o.note && (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1.5, px: 1 }}>
              Note: {o.note}
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                Timeline
              </Typography>
              {o.expectedDate && open && (
                <Typography variant="body2" sx={{ mb: 1.5, color: o.overdue ? 'error.main' : 'text.secondary', fontWeight: o.overdue ? 600 : 400 }}>
                  Expected by {formatDate(o.expectedDate)}
                  {o.overdue ? ' — overdue' : ''}
                </Typography>
              )}
              <Stack spacing={1.5}>
                {o.timeline.map((t, i) => (
                  <Stack key={i} direction="row" spacing={1.25}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: STEP_COLOR[t.status] ?? 'divider', mt: 0.75, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {STEP_LABEL[t.status] ?? t.status}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                        {formatDateTime(t.at)}
                        {t.by ? ` · ${t.by.name}` : ''}
                      </Typography>
                      {t.note && <Typography variant="caption">{t.note}</Typography>}
                    </Box>
                  </Stack>
                ))}
              </Stack>
              {o.purchase && (
                <Button component={RouterLink} to={`/purchases/${o.purchase.id}`} variant="outlined" fullWidth sx={{ mt: 2 }}>
                  Open bill {o.purchase.purchaseNo}
                </Button>
              )}
              <Link component={RouterLink} to={`/suppliers/${o.supplier.id}`} variant="body2" sx={{ display: 'block', mt: 1.5 }}>
                Open supplier →
              </Link>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={cancelling} onClose={() => setCancelling(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Cancel order {o.orderNo}?</DialogTitle>
        <DialogContent>
          <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} autoFocus slotProps={{ htmlInput: { maxLength: 200 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(false)}>Keep order</Button>
          <Button color="error" variant="contained" onClick={doCancel} disabled={reason.trim().length < 3 || cancelState.isLoading}>
            Cancel order
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
