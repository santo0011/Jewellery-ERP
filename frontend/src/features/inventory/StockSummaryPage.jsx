import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { formatINR, formatWeight, METAL_OPTIONS, METAL_POOL_KINDS } from '@jerp/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { purityLabel } from '../products/productForm.js';
import { useStockSummaryQuery } from './inventoryApi.js';

const metalName = (m) => METAL_OPTIONS.find((o) => o.value === m)?.label ?? m;

export default function StockSummaryPage() {
  const { data: session } = useSession();
  const canSeeCost = usePermission('product.viewCost');
  const canAdjust = usePermission('inventory.adjust');
  const [branchId, setBranchId] = useState('');
  const { data, isLoading, error, refetch } = useStockSummaryQuery(branchId ? { branchId } : {});

  const fineByMetal = (data?.products ?? []).reduce((acc, r) => ({ ...acc, [r.metal]: (acc[r.metal] ?? 0) + r.fineMg }), {});
  for (const p of data?.metalPools ?? []) fineByMetal[p.metal] = (fineByMetal[p.metal] ?? 0) + p.fineMg;

  return (
    <>
      <PageHeader
        title="Stock summary"
        subtitle="Live stock by metal and purity, weighed to the milligram."
        breadcrumbs={[{ label: 'Stock' }, { label: 'Stock summary' }]}
        actions={
          session.branches.length > 1 && (
            <TextField select size="small" label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">All my branches</MenuItem>
              {session.branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )
        }
      />
      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.products.length && !data.metalPools.length ? (
        <Card>
          <EmptyState
            title="Nothing in stock yet"
            description="Create products, then post them with an opening stock entry. Bullion and old gold can be added there too."
            action={
              canAdjust && (
                <Button component={RouterLink} to="/inventory/opening" variant="contained">
                  Go to opening stock
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          {data.inTransit > 0 && (
            <Alert severity="info" sx={{ mb: 2 }} action={<Button component={RouterLink} to="/inventory/transfers" color="inherit" size="small">View</Button>}>
              {data.inTransit} item{data.inTransit === 1 ? ' is' : 's are'} in transit between branches and not counted below.
            </Alert>
          )}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {Object.entries(fineByMetal).map(([metal, fine]) => (
              <Grid key={metal} size={{ xs: 12, sm: 4 }}>
                <Card sx={{ borderTop: 3, borderTopColor: metal === 'gold' ? 'primary.main' : 'divider' }}>
                  <CardContent>
                    <Typography variant="overline" color="textSecondary">
                      Total fine {metalName(metal).toLowerCase()}
                    </Typography>
                    <Typography variant="h2" component="p" sx={{ color: metal === 'gold' ? 'accent.main' : 'text.primary' }}>
                      {formatWeight(fine)}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Jewellery + metal stock, in pure-metal terms
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Typography variant="h4" sx={{ mb: 1.5 }}>
            Jewellery in stock
          </Typography>
          <Card sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Metal & purity</TableCell>
                  <TableCell align="right">Items</TableCell>
                  <TableCell align="right">Pieces</TableCell>
                  <TableCell align="right">Gross</TableCell>
                  <TableCell align="right">Net</TableCell>
                  <TableCell align="right">Fine</TableCell>
                  {canSeeCost && <TableCell align="right">Cost value</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Typography variant="body2" color="textSecondary">
                        No tagged items in stock.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.products.map((r) => (
                    <TableRow key={`${r.metal}:${r.purity}`} hover>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {metalName(r.metal)} {purityLabel(r.metal, r.purity)}
                      </TableCell>
                      <TableCell align="right">{r.items}</TableCell>
                      <TableCell align="right">{r.pieces}</TableCell>
                      <TableCell align="right">{formatWeight(r.grossMg)}</TableCell>
                      <TableCell align="right">{formatWeight(r.netMg)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {formatWeight(r.fineMg)}
                      </TableCell>
                      {canSeeCost && <TableCell align="right">{formatINR(r.costPaise, { decimals: 0 })}</TableCell>}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          <Typography variant="h4" sx={{ mb: 1.5 }}>
            Metal stock
          </Typography>
          <Card sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Branch</TableCell>
                  <TableCell>Metal & purity</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Gross</TableCell>
                  <TableCell align="right">Fine</TableCell>
                  {canSeeCost && <TableCell align="right">Value</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {data.metalPools.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <Typography variant="body2" color="textSecondary">
                        No bullion, old gold or scrap held.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data.metalPools.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.branch?.name}</TableCell>
                      <TableCell>
                        {metalName(p.metal)} {purityLabel(p.metal, p.purity)}
                      </TableCell>
                      <TableCell>{METAL_POOL_KINDS.find((k) => k.value === p.kind)?.label}</TableCell>
                      <TableCell align="right">{formatWeight(p.grossMg)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {formatWeight(p.fineMg)}
                      </TableCell>
                      {canSeeCost && <TableCell align="right">{p.valuePaise ? formatINR(p.valuePaise, { decimals: 0 }) : '—'}</TableCell>}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
          <Box sx={{ height: 8 }} />
        </>
      )}
    </>
  );
}
