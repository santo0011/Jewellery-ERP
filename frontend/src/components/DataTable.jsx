import {
  Box,
  Card,
  Divider,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { Fragment } from 'react';
import { EmptyState, ErrorState } from './StateViews.jsx';
import { t } from '../i18n/index.js';

const cellValue = (column, row) => (column.render ? column.render(row) : (row[column.key] ?? '—'));

/**
 * Phones and tablets: each row is a card — the first column as its title with the row's actions beside it, and the
 * other columns as label / value pairs in two columns (`desktopOnly` columns are left out; `wide` ones take a full row).
 */
function MobileList({ columns, rows, getRowId }) {
  const [primary, ...rest] = columns.filter((c) => !c.desktopOnly && c.key !== 'actions');
  const actions = columns.find((c) => c.key === 'actions');
  // More than two buttons (wider than actionsWidth(2)) would squeeze the title, so they get their own row at the bottom.
  const actionsBelow = Boolean(actions) && (actions.width ?? 0) > 96;
  return (
    // Phones: one card per row; tablets: two side by side.
    <Box sx={{ p: 1, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>
      {rows.map((row) => (
        <Box key={getRowId(row)} sx={{ px: 1.75, py: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 1px 2px rgba(23, 23, 23, 0.04)' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0, flex: 1, fontWeight: 600, overflowWrap: 'anywhere' }}>{cellValue(primary, row)}</Box>
            {actions && !actionsBelow && <Box sx={{ flexShrink: 0, mr: -0.75, mt: -0.5 }}>{actions.render(row)}</Box>}
          </Stack>
          {rest.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', columnGap: 1.5, rowGap: 1.25, mt: 1.25, pt: 1.25, borderTop: 1, borderColor: 'divider', borderTopStyle: 'dashed' }}>
              {rest.map((c) => (
                <Box key={c.key} sx={{ minWidth: 0, gridColumn: c.wide ? '1 / -1' : 'auto', textAlign: 'left' }}>
                  <Typography sx={{ display: 'block', fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', lineHeight: 1.6 }}>
                    {c.label}
                  </Typography>
                  <Box sx={{ fontSize: '0.8125rem', minWidth: 0, overflowWrap: 'anywhere', '& .MuiTypography-root': { textAlign: 'left' } }}>{cellValue(c, row)}</Box>
                </Box>
              ))}
            </Box>
          )}
          {actionsBelow && <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, mr: -0.75, mb: -0.5, pt: 0.5, borderTop: 1, borderColor: 'divider', borderTopStyle: 'dashed' }}>{actions.render(row)}</Box>}
        </Box>
      ))}
    </Box>
  );
}

export default function DataTable({
  columns,
  rows = [],
  loading = false,
  fetching = false,
  error,
  onRetry,
  getRowId = (row) => row._id ?? row.id,
  empty,
  pagination,
  toolbar,
}) {
  const mobile = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const showEmpty = !loading && !error && rows.length === 0;

  return (
    <Card sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23, 23, 23, 0.04), 0 10px 30px -12px rgba(120, 104, 60, 0.18)', ...(mobile && { bgcolor: 'soft.main' }) }}>
      {toolbar && (
        <>
          {/* Phones: the search box takes a full row and the filters sit two to a row. */}
          <Box
            sx={{
              p: { xs: 1.5, sm: 2 },
              bgcolor: 'background.paper',
              '@media (max-width:599.95px)': {
                '& > .MuiStack-root': { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 },
                '& > .MuiStack-root > *': { m: '0 !important', width: '100% !important', maxWidth: 'none !important', minWidth: 0 },
                '& > .MuiStack-root > :first-of-type': { gridColumn: '1 / -1' },
                // Segmented filters (Working / Left / All …) take a full row, options sharing it evenly.
                '& > .MuiStack-root > .MuiToggleButtonGroup-root': { gridColumn: '1 / -1', display: 'flex' },
                '& .MuiToggleButtonGroup-root > .MuiToggleButton-root': { flex: 1, whiteSpace: 'nowrap', px: 1 },
              },
            }}
          >
            {toolbar}
          </Box>
          <Divider />
        </>
      )}
      <Box sx={{ height: 2 }}>{(loading || fetching) && <LinearProgress sx={{ height: 2 }} />}</Box>

      {error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : showEmpty ? (
        <EmptyState {...empty} />
      ) : loading ? (
        <Box sx={{ minHeight: 160 }} />
      ) : mobile ? (
        <MobileList columns={columns} rows={rows} getRowId={getRowId} />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {columns.map((c) => (
                  <TableCell key={c.key} align={c.align} sx={{ width: c.width }}>
                    {c.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Rows are not clickable; a record opens only from its View button. */}
              {rows.map((row) => (
                <TableRow key={getRowId(row)} hover sx={{ '&:last-of-type td': { borderBottom: 0 } }}>
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.align} sx={{ py: 1.25 }}>
                      {cellValue(c, row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {pagination && !error && pagination.total > 0 && (
        <>
          <Divider />
          <TablePagination
            component="div"
            count={pagination.total}
            page={pagination.page - 1}
            rowsPerPage={pagination.limit}
            rowsPerPageOptions={mobile ? [] : [10, 20, 50, 100]}
            onPageChange={(e, page) => pagination.onPageChange(page + 1)}
            onRowsPerPageChange={(e) => pagination.onLimitChange(Number(e.target.value))}
            labelRowsPerPage={t('Rows per page')}
            sx={{ bgcolor: 'background.paper', '& .MuiTablePagination-toolbar': { px: { xs: 1.5, sm: 2 } } }}
          />
        </>
      )}
    </Card>
  );
}
