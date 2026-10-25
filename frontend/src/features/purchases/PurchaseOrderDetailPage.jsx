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
import { t } from '../../i18n/index.js';

const STEP_COLOR = { open: 'info.main', received: 'success.main', cancelled: 'text.disabled' };
const STEP_LABEL = { open: t('Ordered'), received: t('Received'), cancelled: t('Cancelled') };

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
      toast.success(t('Order {{orderNo}} cancelled', { orderNo: o.orderNo }));
      setCancelling(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={t('Order {{orderNo}}', { orderNo: o.orderNo })}
        subtitle={(o.branch ? t('{{name}} · ordered {{orderDate}} · for {{name2}}', { name: o.supplier.name, orderDate: formatDate(o.orderDate), name2: o.branch.name }) : t('{{name}} · ordered {{orderDate}}', { name: o.supplier.name, orderDate: formatDate(o.orderDate) }))}
        back={{ to: '/purchases/orders', label: t('Purchase orders') }}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <OrderStatusChip status={o.status} overdue={o.overdue} />
            {open && canCancel && (
              <Button color="error" startIcon={<CancelOutlinedIcon />} onClick={() => setCancelling(true)}>
                {t('Cancel order')}
              </Button>
            )}
            {open && canReceive && (
              <Button variant="contained" startIcon={<Inventory2OutlinedIcon />} onClick={() => navigate(`/purchases/new?orderId=${o.id}`)}>
                {t('Goods arrived — enter bill')}
              </Button>
            )}
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <DataTable
            columns={[
              { key: 'item', label: t('Item'), render: (l) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{l.description}</Typography> },
              { key: 'purity', label: t('Purity'), render: (l) => purityLabel(l.metal, l.purity) },
              { key: 'qty', label: t('Qty'), align: 'right', render: (l) => l.quantity },
              { key: 'wt', label: t('Approx. weight'), align: 'right', render: (l) => (l.weightMg ? formatWeight(l.weightMg) : '—') },
              { key: 'amt', label: t('Estimate'), align: 'right', render: (l) => (l.amountPaise ? formatINR(l.amountPaise, { decimals: 0 }) : '—') },
            ]}
            rows={o.lines.map((l, i) => ({ ...l, rowKey: i }))}
            getRowId={(l) => l.rowKey}
          />
          <Stack direction="row" spacing={3} sx={{ mt: 1.5, px: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2">
              <strong>{o.totals.quantity}</strong> {t('pcs')}
            </Typography>
            {o.totals.weightMg > 0 && (
              <Typography variant="body2">
                ~<strong>{formatWeight(o.totals.weightMg)}</strong>
              </Typography>
            )}
            {o.totals.amountPaise > 0 && (
              <Typography variant="body2">
                {t('Estimate')} <strong>{formatINR(o.totals.amountPaise, { decimals: 0 })}</strong>
              </Typography>
            )}
          </Stack>
          {o.note && (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1.5, px: 1 }}>
              {t('Note: {{note}}', { note: o.note })}
            </Typography>
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                {t('Timeline')}
              </Typography>
              {o.expectedDate && open && (
                <Typography variant="body2" sx={{ mb: 1.5, color: o.overdue ? 'error.main' : 'text.secondary', fontWeight: o.overdue ? 600 : 400 }}>
                  {(o.overdue ? t('Expected by {{expectedDate}} — overdue', { expectedDate: formatDate(o.expectedDate) }) : t('Expected by {{expectedDate}}', { expectedDate: formatDate(o.expectedDate) }))}
                </Typography>
              )}
              <Stack spacing={1.5}>
                {o.timeline.map((event, i) => (
                  <Stack key={i} direction="row" spacing={1.25}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: STEP_COLOR[event.status] ?? 'divider', mt: 0.75, flexShrink: 0 }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {STEP_LABEL[event.status] ?? event.status}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                        {formatDateTime(event.at)}
                        {event.by ? ` · ${event.by.name}` : ''}
                      </Typography>
                      {event.note && <Typography variant="caption">{event.note}</Typography>}
                    </Box>
                  </Stack>
                ))}
              </Stack>
              {o.purchase && (
                <Button component={RouterLink} to={`/purchases/${o.purchase.id}`} variant="outlined" fullWidth sx={{ mt: 2 }}>
                  {t('Open bill {{purchaseNo}}', { purchaseNo: o.purchase.purchaseNo })}
                </Button>
              )}
              <Link component={RouterLink} to={`/suppliers/${o.supplier.id}`} variant="body2" sx={{ display: 'block', mt: 1.5 }}>
                {t('Open supplier →')}
              </Link>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={cancelling} onClose={() => setCancelling(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{t('Cancel order {{orderNo}}?', { orderNo: o.orderNo })}</DialogTitle>
        <DialogContent>
          <TextField label={t('Reason')} value={reason} onChange={(e) => setReason(e.target.value)} sx={{ mt: 1 }} autoFocus slotProps={{ htmlInput: { maxLength: 200 } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelling(false)}>{t('Keep order')}</Button>
          <Button color="error" variant="contained" onClick={doCancel} disabled={reason.trim().length < 3 || cancelState.isLoading}>
            {t('Cancel order')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
