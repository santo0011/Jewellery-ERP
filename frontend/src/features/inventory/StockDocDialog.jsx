import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ADJUSTMENT_REASONS, formatINR, formatWeight, METAL_OPTIONS, METAL_POOL_KINDS } from '@jerp/shared';
import { formatDateTime } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import { SelectedProducts } from './ProductPicker.jsx';
import { DocStatusChip } from './stockUi.jsx';

const label = (list, v) => list.find((o) => o.value === v)?.label ?? v;

export default function StockDocDialog({ doc, onClose, actions }) {
  if (!doc) return null;
  const isTransfer = Boolean(doc.fromBranch);
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <span>{doc.docNo}</span>
          <DocStatusChip status={doc.status} />
        </Stack>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr' }, columnGap: 2, rowGap: 0.5, mb: 2 }}>
          {[
            isTransfer ? ['Route', `${doc.fromBranch?.name} → ${doc.toBranch?.name}`] : ['Branch', doc.branch?.name],
            doc.reason && ['Reason', label(ADJUSTMENT_REASONS, doc.reason)],
            ['Created', `${formatDateTime(doc.createdAt ?? doc.dispatchedAt)} by ${(doc.createdBy ?? doc.dispatchedBy)?.name ?? '—'}`],
            doc.closedAt && [doc.status === 'received' ? 'Received' : 'Closed', `${formatDateTime(doc.closedAt)} by ${doc.closedBy?.name ?? '—'}`],
            doc.postedAt && ['Posted', formatDateTime(doc.postedAt)],
            doc.note && ['Note', doc.note],
            doc.rejectionReason && ['Rejection reason', doc.rejectionReason],
          ]
            .filter(Boolean)
            .map(([k, v]) => (
              <Box key={k} sx={{ display: 'contents' }}>
                <Typography variant="body2" color="textSecondary">
                  {k}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {v}
                </Typography>
              </Box>
            ))}
        </Box>
        {doc.products?.length > 0 && <SelectedProducts products={doc.products} showCost={doc.totals?.valuePaise !== undefined} />}
        {doc.metalLines?.length > 0 && (
          <Table size="small" sx={{ mt: 2 }}>
            <TableHead>
              <TableRow>
                <TableCell>Metal</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Gross</TableCell>
                <TableCell align="right">Fine</TableCell>
                {doc.totals?.valuePaise !== undefined && <TableCell align="right">Value</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {doc.metalLines.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {l.direction === 'out' ? '− ' : '+ '}
                    {label(METAL_OPTIONS, l.metal)} {purityLabel(l.metal, l.purity)}
                  </TableCell>
                  <TableCell>{label(METAL_POOL_KINDS, l.kind)}</TableCell>
                  <TableCell align="right">{formatWeight(l.grossWeightMg)}</TableCell>
                  <TableCell align="right">{formatWeight(l.fineWeightMg)}</TableCell>
                  {doc.totals?.valuePaise !== undefined && <TableCell align="right">{l.valuePaise ? formatINR(l.valuePaise, { decimals: 0 }) : '—'}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {actions}
        <Button color="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
