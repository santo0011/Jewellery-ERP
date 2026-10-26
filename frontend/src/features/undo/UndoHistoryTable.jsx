import { Box, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import DataTable from '../../components/DataTable.jsx';
import { formatDateTime } from '../../utils/format.js';
import { t } from '../../i18n/index.js';

export const UNDO_STATUS_LABEL = { active: t('Can be undone'), undone: t('Undone'), dismissed: t('Kept'), superseded: t('Reversed elsewhere') };
const STATUS_COLOR = { active: 'info', undone: 'success', dismissed: 'default', superseded: 'default' };

/**
 * Every action that went on an Undo stack, newest first, with what became of it: still undoable, undone (by whom,
 * when, why and with what result), kept, or reversed some other way. Nothing here is ever removed.
 */
export default function UndoHistoryTable({ query, page, setPage, limit, setLimit, status, setStatus, panelFilter, showPanel = true }) {
  const { data, isLoading, isFetching, error, refetch } = query;
  const columns = [
    { key: 'createdAt', label: t('When'), width: 170, render: (e) => <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.createdAt)}</Typography> },
    ...(showPanel ? [{ key: 'panel', label: t('Panel'), render: (e) => (e.scope === 'organisation' ? t('Organisation') : e.scope === 'platform' ? t('Platform') : (e.branch?.name ?? '—')) }] : []),
    {
      key: 'action',
      label: t('Action'),
      render: (e) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t(e.title)}
          </Typography>
          {e.label && (
            <Typography variant="caption" color="textSecondary">
              {e.label}
            </Typography>
          )}
        </Box>
      ),
    },
    { key: 'by', label: t('Done by'), render: (e) => e.createdBy?.name ?? '—' },
    { key: 'status', label: t('Status'), render: (e) => <Chip size="small" label={UNDO_STATUS_LABEL[e.status] ?? e.status} color={STATUS_COLOR[e.status] ?? 'default'} variant={e.status === 'undone' ? 'filled' : 'outlined'} sx={{ height: 22 }} /> },
    {
      key: 'resolution',
      label: t('Undone / kept'),
      render: (e) =>
        e.resolution ? (
          <Box sx={{ maxWidth: 360 }}>
            <Typography variant="body2">
              {[e.resolution.by?.name, formatDateTime(e.resolution.at)].filter(Boolean).join(' · ')}
              {e.resolution.mode === 'reversal' && (
                <Typography component="span" variant="caption" color="textSecondary">
                  {' '}
                  ({t('reversal')})
                </Typography>
              )}
            </Typography>
            {e.resolution.reason && (
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                “{e.resolution.reason}”
              </Typography>
            )}
          </Box>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={data?.items}
      getRowId={(e) => e.id}
      loading={isLoading}
      fetching={isFetching}
      error={error}
      onRetry={refetch}
      empty={{ title: status ? t('No matching actions') : t('No actions yet'), description: t('Actions that can be undone appear here as they happen.') }}
      pagination={data && { ...data.meta, onPageChange: setPage, onLimitChange: (l) => { setLimit(l); setPage(1); } }}
      toolbar={
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField select label={t('Status')} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} sx={{ maxWidth: { md: 200 } }}>
            <MenuItem value="">{t('All')}</MenuItem>
            {Object.entries(UNDO_STATUS_LABEL).map(([v, l]) => (
              <MenuItem key={v} value={v}>
                {l}
              </MenuItem>
            ))}
          </TextField>
          {panelFilter}
        </Stack>
      }
    />
  );
}
