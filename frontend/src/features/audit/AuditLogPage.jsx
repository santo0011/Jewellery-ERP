import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { Box, Chip, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { AUDIT_ACTION_LABELS, AUDIT_MODULES, formatINR, formatPercent } from '@jerp/shared';
import { useState } from 'react';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatDateTime } from '../../utils/format.js';
import { useAuditLogsQuery } from './auditApi.js';
import { describeEntry, fieldLabel, moduleLabel } from './describeEntry.js';

const ACTION_COLORS = { login_failed: 'warning', token_reuse: 'error', delete: 'error', status_change: 'info' };

function formatValue(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'logo') return 'image';
  if (typeof v === 'number' && field.endsWith('Paise')) return formatINR(v, { decimals: 0 });
  if (typeof v === 'number' && field.endsWith('Bps')) return formatPercent(v);
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
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
      {changes.length > 6 && <li>+{changes.length - 6} more</li>}
    </Box>
  );
}

export default function AuditLogPage() {
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
    { key: 'createdAt', label: 'When', width: 180, render: (e) => <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.createdAt)}</Typography> },
    {
      key: 'user',
      label: 'User',
      render: (e) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {e.user?.name ?? 'System'}
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
      label: 'Action',
      render: (e) => <Chip size="small" label={AUDIT_ACTION_LABELS[e.action] ?? e.action} color={ACTION_COLORS[e.action] ?? 'default'} variant="outlined" sx={{ height: 22 }} />,
    },
    {
      key: 'detail',
      label: 'Detail',
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
      <PageHeader
        title="Audit log"
        subtitle="A permanent record of sign-ins and changes made in your business."
        breadcrumbs={[{ label: 'Settings' }, { label: 'Audit log' }]}
      />
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(e) => e.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={filtered ? { title: 'No matching activity', description: 'Try a wider date range or different filters.' } : { title: 'No activity yet' }}
        pagination={data && { ...data.meta, onPageChange: setPage, onLimitChange: (l) => { setLimit(l); setPage(1); } }}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <TextField
              placeholder="Search by user"
              value={search}
              onChange={set(setSearch)}
              sx={{ maxWidth: { md: 240 } }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
            />
            <TextField select label="Area" value={module} onChange={set(setModule)} sx={{ maxWidth: { md: 180 } }}>
              <MenuItem value="">All areas</MenuItem>
              {AUDIT_MODULES.map((m) => (
                <MenuItem key={m} value={m}>
                  {moduleLabel(m)}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Action" value={action} onChange={set(setAction)} sx={{ maxWidth: { md: 200 } }}>
              <MenuItem value="">All actions</MenuItem>
              {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
                <MenuItem key={key} value={key}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
            <TextField type="date" label="From" value={from} onChange={set(setFrom)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: to || undefined } }} sx={{ maxWidth: { md: 170 } }} />
            <TextField type="date" label="To" value={to} onChange={set(setTo)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: from || undefined } }} sx={{ maxWidth: { md: 170 } }} />
          </Stack>
        }
      />
    </>
  );
}
