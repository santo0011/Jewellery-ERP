import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, Chip, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { formatINR, formatWeight, METAL_OPTIONS, METAL_POOL_KINDS, MOVEMENT_TYPE_LABELS } from '@jerp/shared';
import { Link as RouterLink } from 'react-router';
import ViewButton from '../../components/ViewButton.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import { t, getLocale } from '../../i18n/index.js';

// Movements whose source document has its own page.
const SOURCE_PAGES = { sale: { path: '/sales', label: t('Open invoice') }, order: { path: '/orders', label: t('Open order') } };
const metalName = (m) => METAL_OPTIONS.find((o) => o.value === m)?.label ?? m;
const kindName = (k) => METAL_POOL_KINDS.find((o) => o.value === k)?.label ?? t('Metal');
const statusName = (s) => (s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : null);
// "Gold 22K (916)", but "Fine silver (999)" - silver purity labels already name the metal.
const metalPurity = (m) => {
  const p = purityLabel(m.metal, m.purity);
  return p.toLowerCase().includes(metalName(m.metal).toLowerCase()) ? p : `${metalName(m.metal)} ${p}`;
};
const signed = (m, mg) => `${m.direction > 0 ? '+' : '−'} ${formatWeight(mg)}`;

/** The essentials only; everything else is in the details drawer (View). */
export function movementColumns({ showProduct = true, onView }) {
  return [
    {
      key: 'when',
      label: t('When'),
      render: (m) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2">{formatDate(m.createdAt)}</Typography>
          <Typography variant="caption" color="textSecondary">
            {new Date(m.createdAt).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'type',
      label: t('Movement'),
      render: (m) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, color: m.direction > 0 ? 'success.main' : 'error.main' }}>
            {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {m.source.docNo}
          </Typography>
        </Box>
      ),
    },
    ...(showProduct
      ? [
          {
            key: 'item',
            label: t('Item'),
            render: (m) => (
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {m.product ? m.product.sku : kindName(m.kind)}
                  {m.product && (
                    <Typography component="span" variant="body2" color="textSecondary">
                      {' '}
                      · {m.product.name}
                    </Typography>
                  )}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {metalPurity(m)}
                  {m.branch ? ` · ${m.branch.name}` : ''}
                </Typography>
              </Box>
            ),
          },
        ]
      : []),
    {
      key: 'weight',
      label: t('Weight'),
      align: 'right',
      render: (m) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: m.direction > 0 ? 'success.main' : 'error.main' }}>
            {signed(m, m.grossMg)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {t('fine {{fine}}', { fine: formatWeight(m.fineMg) })}
          </Typography>
        </Box>
      ),
    },
    { key: 'actions', label: t('Action'), align: 'right', width: 80, render: (m) => <ViewButton onClick={() => onView(m)} name={m.source.docNo} /> },
  ];
}

function Row({ label, children }) {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 1, justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Typography variant="body2" color="textSecondary" sx={{ flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 500, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>
        {children ?? '—'}
      </Typography>
    </Stack>
  );
}

/** Everything recorded for one stock movement. */
export function MovementDetailsDrawer({ movement: m, onClose, showCost }) {
  const doc = m && SOURCE_PAGES[m.source.docType];
  return (
    <Drawer anchor="right" open={Boolean(m)} onClose={onClose} slotProps={{ paper: { sx: { width: { xs: '100%', sm: 440 } } } }}>
      {m && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Stack direction="row" sx={{ px: 3, py: 2, alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h3">{MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</Typography>
              <Typography variant="body2" color="textSecondary">
                {m.source.docNo} · {formatDateTime(m.createdAt)}
              </Typography>
            </Box>
            <IconButton onClick={onClose} aria-label={t('Close')} edge="end">
              <CloseRoundedIcon />
            </IconButton>
          </Stack>
          <Divider />
          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
            <Chip
              label={m.direction > 0 ? t('Stock in · {{weight}}', { weight: signed(m, m.grossMg) }) : t('Stock out · {{weight}}', { weight: signed(m, m.grossMg) })}
              color={m.direction > 0 ? 'success' : 'error'}
              variant="outlined"
              sx={{ fontWeight: 700, mb: 1.5 }}
            />
            <Typography variant="overline" color="textSecondary" sx={{ display: 'block' }}>
              {t('What moved')}
            </Typography>
            <Stack divider={<Divider flexItem />}>
              <Row label={t('Item')}>
                {m.product ? (
                  <Box component={RouterLink} to={`/products/${m.product.id}`} onClick={onClose} sx={{ color: 'inherit', fontWeight: 600 }}>
                    {m.product.sku} · {m.product.name}
                  </Box>
                ) : (
                  kindName(m.kind)
                )}
              </Row>
              <Row label={t('Metal')}>
                {metalPurity(m)}
              </Row>
              {m.qty != null && <Row label={t('Quantity')}>{m.qty}</Row>}
              <Row label={t('Gross weight')}>{formatWeight(m.grossMg)}</Row>
              <Row label={t('Net weight')}>{m.netMg != null ? formatWeight(m.netMg) : null}</Row>
              <Row label={t('Fine weight')}>{formatWeight(m.fineMg)}</Row>
              {showCost && <Row label={t('Value')}>{m.valuePaise != null ? formatINR(m.valuePaise) : null}</Row>}
              {(m.statusBefore || m.statusAfter) && (
                <Row label={t('Item status')}>
                  {statusName(m.statusBefore) ?? '—'} → {statusName(m.statusAfter) ?? '—'}
                </Row>
              )}
            </Stack>

            <Typography variant="overline" color="textSecondary" sx={{ display: 'block', mt: 2.5 }}>
              {t('Where and why')}
            </Typography>
            <Stack divider={<Divider flexItem />}>
              <Row label={t('Branch')}>{m.branch?.name}</Row>
              <Row label={t('Document')}>{m.source.docNo}</Row>
              <Row label={t('Business date')}>{m.businessDate ? formatDate(m.businessDate) : null}</Row>
              <Row label={t('Recorded by')}>{m.createdBy?.name}</Row>
              <Row label={t('Recorded at')}>{formatDateTime(m.createdAt)}</Row>
              {m.note && <Row label={t('Note')}>{m.note}</Row>}
            </Stack>
          </Box>
          {doc && (
            <>
              <Divider />
              <Box sx={{ px: 3, py: 2 }}>
                <Button fullWidth variant="contained" component={RouterLink} to={`${doc.path}/${m.source.docId}`} endIcon={<ArrowForwardRoundedIcon />} onClick={onClose}>
                  {doc.label} {m.source.docNo}
                </Button>
              </Box>
            </>
          )}
        </Box>
      )}
    </Drawer>
  );
}
