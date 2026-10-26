import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { Box, Chip, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { AUDIT_ACTION_LABELS, AUDIT_MODULES, formatINR, formatPercent } from '@jerp/shared';
import { useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import ViewTabs from '../../components/ViewTabs.jsx';
import { useTabParam } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { UndoHistoryTab } from '../undo/UndoHistoryPage.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatDateTime } from '../../utils/format.js';
import { useAuditLogsQuery } from './auditApi.js';
import { describeEntry, fieldLabel, moduleLabel } from './describeEntry.js';
import { t } from '../../i18n/index.js';

const ACTION_COLORS = { login_failed: 'warning', token_reuse: 'error', delete: 'error', status_change: 'info' };

function formatValue(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'logo') return 'image';
  if (typeof v === 'number' && field.endsWith('Paise')) return formatINR(v, { decimals: 0 });
  if (typeof v === 'number' && field.endsWith('Bps')) return formatPercent(v);
  if (typeof v === 'boolean') return v ? t('On') : t('Off');
  if (Array.isArray(v)) return v.join(', ') || '—';
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${Array.isArray(x) ? x.join(', ') || '—' : x}`).join('; ');
  return String(v);
}

function Changes({ changes }) {
  if (!changes.length) return null;
  return (
    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2, color: 'text.secondary', fontSize: '0.75rem' }}>
      {changes.slice(0, 6).map((c) => (
        <li key={c.field}>
          <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
            {fieldLabel(c.field)}
          </Box>
          : {formatValue(c.field, c.from)} → {formatValue(c.field, c.to)}
        </li>
      ))}
      {changes.length > 6 && <li>{t('+{{value}} more', { value: changes.length - 6 })}</li>}
    </Box>
  );
}

/** The Activity tab: every sign-in and change, newest first, with filters. */
function ActivityTab() {
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const q = useDebounce(search.trim());

  const params = { page, limit, ...(q && { q }), ...(module && { module }), ...(action && { action }), ...(from && { from }), ...(to && { to }) };
  const { data, isLoading, isFetching, error, refetch } = useAuditLogsQuery(params);
  const filtered = Boolean(q || module || action || from || to);
  const set = (fn) => (e) => {
    fn(e.target.value);
    setPage(1);
  };

  const columns = [
    { key: 'createdAt', label: t('When'), width: 180, render: (e) => <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.createdAt)}</Typography> },
    {
      key: 'user',
      label: t('User'),
      render: (e) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {e.user?.name ?? t('System')}
          </Typography>
          {e.ip && (
            <Typography variant="caption" color="textSecondary">
              {e.ip}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'action',
      label: t('Action'),
      render: (e) => <Chip size="small" label={AUDIT_ACTION_LABELS[e.action] ?? e.action} color={ACTION_COLORS[e.action] ?? 'default'} variant="outlined" sx={{ height: 22 }} />,
    },
    {
      key: 'detail',
      label: t('Detail'),
      render: (e) => (
        <Box>
          <Typography variant="body2">{describeEntry(e)}</Typography>
          <Changes changes={e.changes} />
        </Box>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(e) => e.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={filtered ? { title: t('No matching activity'), description: t('Try a wider date range or different filters.') } : { title: t('No activity yet') }}
        pagination={data && { ...data.meta, onPageChange: setPage, onLimitChange: (l) => { setLimit(l); setPage(1); } }}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField
              placeholder={t('Search by user')}
              value={search}
              onChange={set(setSearch)}
              sx={{ maxWidth: { md: 240 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
            />
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Area')} value={module} onChange={set(setModule)} sx={{ maxWidth: { md: 180 } }}>
              <MenuItem value="">{t('All areas')}</MenuItem>
              {AUDIT_MODULES.map((m) => (
                <MenuItem key={m} value={m}>
                  {moduleLabel(m)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Action')} value={action} onChange={set(setAction)} sx={{ maxWidth: { md: 200 } }}>
              <MenuItem value="">{t('All actions')}</MenuItem>
              {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField type="date" label={t('From')} value={from} onChange={set(setFrom)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || undefined } }} sx={{ maxWidth: { md: 170 } }} />
            <TextField type="date" label={t('To')} value={to} onChange={set(setTo)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }} sx={{ maxWidth: { md: 170 } }} />
          </Stack>
        }
      />
    </>
  );
}

/**
 * Audit log: what happened (Activity) and what was undone (Undo history) on one page, as tabs. Each tab shows only
 * to people who may see it; the page opens on the first one they have.
 */
export default function AuditLogPage() {
  const canAudit = usePermission('audit.view');
  const canUndo = usePermission('undo.view');
  const [tab, setTab] = useTabParam(canAudit ? 'activity' : 'undo');
  const current = tab === 'undo' && canUndo ? 'undo' : canAudit ? 'activity' : 'undo';
  return (
    <>
      <PageHeader
        title={t('Audit log')}
        subtitle={current === 'undo' ? t('What was undone or kept — by whom, when and why. Nothing here is ever removed.') : t('A permanent record of sign-ins and changes made in your business.')}
        breadcrumbs={[{ label: t('Settings') }, { label: t('Audit log') }]}
      />
      {canAudit && canUndo && (
        <ViewTabs
          value={current}
          onChange={setTab}
          items={[
            { value: 'activity', label: t('Activity'), icon: HistoryRoundedIcon },
            { value: 'undo', label: t('Undo history'), short: t('Undo'), icon: UndoRoundedIcon },
          ]}
        />
      )}
      {current === 'undo' ? <UndoHistoryTab /> : <ActivityTab />}
    </>
  );
}
