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

const cellValue = (column, row) => (column.render ? column.render(row) : (row[column.key] ?? '—'));

function MobileList({ columns, rows, getRowId }) {
  const [primary, ...rest] = columns.filter((c) => !c.desktopOnly);
  const actions = columns.find((c) => c.key === 'actions');
  return (
    <Stack divider={<Divider />}>
      {rows.map((row) => (
        <Box key={getRowId(row)} sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0, fontWeight: 600 }}>{cellValue(primary, row)}</Box>
            {actions && <Box>{actions.render(row)}</Box>}
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, rowGap: 0.5, mt: 1 }}>
            {rest
              .filter((c) => c.key !== 'actions')
              .map((c) => (
                <Fragment key={c.key}>
                  <Typography variant="overline" color="textSecondary" sx={{ lineHeight: '20px' }}>
                    {c.label}
                  </Typography>
                  <Box sx={{ fontSize: '0.8125rem', minWidth: 0, overflowWrap: 'anywhere' }}>{cellValue(c, row)}</Box>
                </Fragment>
              ))}
          </Box>
        </Box>
      ))}
    </Stack>
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
    <Card sx={{ borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 2px rgba(23, 23, 23, 0.04), 0 10px 30px -12px rgba(120, 104, 60, 0.18)' }}>
      {toolbar && (
        <>
          <Box sx={{ p: 2 }}>{toolbar}</Box>
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
            rowsPerPageOptions={[10, 20, 50, 100]}
            onPageChange={(e, page) => pagination.onPageChange(page + 1)}
            onRowsPerPageChange={(e) => pagination.onLimitChange(Number(e.target.value))}
            labelRowsPerPage={mobile ? 'Rows' : 'Rows per page'}
          />
        </>
      )}
    </Card>
  );
}
