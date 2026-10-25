import AddRoundedIcon from '@mui/icons-material/AddRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { EXPENSE_PAY_MODES, formatINR } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import ExpenseFormDrawer from './ExpenseFormDrawer.jsx';
import { useExpenseCategoriesQuery, useExpensesQuery, useVoidExpenseMutation } from './financeApi.js';
import { t } from '../../i18n/index.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const modeLabel = (m) => EXPENSE_PAY_MODES.find((x) => x.value === m)?.label ?? m;
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthStart = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};
const FIELD_VALUE = { Amount: (v) => (v == null ? '—' : inr(v)), Date: (v) => (v ? formatDate(v) : '—'), 'Paid by': modeLabel };
const showValue = (field, v) => (FIELD_VALUE[field] ? FIELD_VALUE[field](v) : (v ?? '—'));

/** Voiding asks why; the expense stays on record, reversed in the books on its own date. */
function VoidDialog({ expense, onClose }) {
  const [reason, setReason] = useState('');
  const [voidExpense, { isLoading }] = useVoidExpenseMutation();
  const submit = async () => {
    try {
      await voidExpense({ id: expense.id, reason: reason.trim() }).unwrap();
      toast.success(t('{{expenseNo}} voided', { expenseNo: expense.expenseNo }));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <Dialog open={Boolean(expense)} onClose={isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      {expense && (
        <>
          <DialogTitle sx={{ fontWeight: 600 }}>{t('Void {{expenseNo}}?', { expenseNo: expense.expenseNo })}</DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
              {t('{{inr}} · {{name}} on {{date}}. It stays on record as voided and is taken out of that month’s expenses.', { inr: inr(expense.amountPaise), name: expense.category.name, date: formatDate(expense.date) })}
            </Typography>
            <TextField autoFocus label={t('Reason')} placeholder={t('e.g. Entered twice')} value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button color="secondary" onClick={onClose} disabled={isLoading}>
              {t('Keep it')}
            </Button>
            <Button variant="contained" color="error" onClick={submit} disabled={reason.trim().length < 3} loading={isLoading}>
              {t('Void expense')}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

/** Everything that happened to an expense: entered, corrected (what changed and why), voided. */
function HistoryDialog({ expense, onClose }) {
  return (
    <Dialog open={Boolean(expense)} onClose={onClose} maxWidth="xs" fullWidth>
      {expense && (
        <>
          <DialogTitle sx={{ fontWeight: 600 }}>{expense.expenseNo}</DialogTitle>
          <DialogContent>
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              {[...expense.history].reverse().map((h, i) => (
                <Box key={i}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Chip size="small" label={h.action === 'created' ? t('Entered') : h.action === 'edited' ? t('Corrected') : t('Voided')} color={h.action === 'voided' ? 'error' : h.action === 'edited' ? 'warning' : 'default'} variant="outlined" sx={{ height: 22 }} />
                    <Typography variant="caption" color="textSecondary">
                      {formatDateTime(h.at)}
                      {h.by ? ` · ${h.by.name}` : ''}
                    </Typography>
                  </Stack>
                  {h.reason && (
                    <Typography variant="body2" sx={{ mt: 0.5 }}>
                      “{h.reason}”
                    </Typography>
                  )}
                  {h.changes?.map((c) => (
                    <Typography key={c.field} variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                      {t(c.field)}: {showValue(c.field, c.from)} → <strong>{showValue(c.field, c.to)}</strong>
                    </Typography>
                  ))}
                </Box>
              ))}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onClose}>{t('Close')}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export default function ExpensesPage() {
  const canCreate = usePermission('expense.create');
  const canEdit = usePermission('expense.edit');
  const canVoid = usePermission('expense.delete');
  const list = useListParams({ from: monthStart(), to: '', categoryId: '', status: '' });
  const { data, isLoading, isFetching, error, refetch } = useExpensesQuery(list.params);
  const { data: categories = [] } = useExpenseCategoriesQuery();
  const [drawer, setDrawer] = useState(null); // null | 'new' | expense
  const [voiding, setVoiding] = useState(null);
  const [history, setHistory] = useState(null);
  const s = data?.meta?.summary;
  const top = s?.byCategory?.[0];

  const columns = [
    {
      key: 'date',
      label: t('Date'),
      render: (e) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatDate(e.date)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {e.expenseNo}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'category',
      label: t('Category'),
      render: (e) => <Chip size="small" label={e.category.name} sx={{ height: 24, fontWeight: 600, bgcolor: 'rgba(var(--brand-rgb), 0.12)', color: 'var(--brand-strong)' }} />,
    },
    {
      key: 'note',
      label: t('Description'),
      wide: true,
      render: (e) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" noWrap sx={{ maxWidth: 320 }}>
            {e.note || '—'}
          </Typography>
          {(e.reference || e.branch?.name) && (
            <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block', maxWidth: 320 }}>
              {[e.reference, e.branch?.name].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
      ),
    },
    { key: 'mode', label: t('Paid by'), render: (e) => modeLabel(e.mode) },
    {
      key: 'amount',
      label: t('Amount'),
      align: 'right',
      render: (e) =>
        e.status === 'void' ? (
          <Stack sx={{ alignItems: { md: 'flex-end' } }}>
            <Typography variant="body2" sx={{ textDecoration: 'line-through', color: 'text.disabled', fontVariantNumeric: 'tabular-nums' }}>
              {inr(e.amountPaise)}
            </Typography>
            <Chip size="small" label={t('Voided')} color="error" variant="outlined" sx={{ height: 20, fontSize: 11 }} />
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {inr(e.amountPaise)}
          </Typography>
        ),
    },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 128,
      render: (e) => (
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title={t('History')}>
            <IconButton size="small" onClick={() => setHistory(e)} aria-label={t('History of {{expenseNo}}', { expenseNo: e.expenseNo })}>
              <HistoryRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {canEdit && e.status === 'active' && (
            <Tooltip title={t('Correct')}>
              <IconButton size="small" onClick={() => setDrawer(e)} aria-label={t('Correct {{expenseNo}}', { expenseNo: e.expenseNo })}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {canVoid && e.status === 'active' && (
            <Tooltip title={t('Void')}>
              <IconButton size="small" onClick={() => setVoiding(e)} aria-label={t('Void {{expenseNo}}', { expenseNo: e.expenseNo })} sx={{ color: 'error.main' }}>
                <BlockRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Expenses')}
        subtitle={t('Shop costs — electricity, rent, transport and the like. Salary is added from Payroll.')}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawer('new')}>
              {t('Add expense')}
            </Button>
          )
        }
      />
      {s && (
        <SummaryCards>
          <SummaryCard icon={PaymentsOutlinedIcon} label={t('Total spent')} value={inr(s.totalPaise)} caption={list.filters.from ? (list.filters.to ? t('Since {{from}} to {{to}}', { from: formatDate(list.filters.from), to: formatDate(list.filters.to) }) : t('Since {{from}}', { from: formatDate(list.filters.from) })) : t('All dates')} tone="amber" hideCaptionOnPhone={false} />
          <SummaryCard icon={ReceiptLongOutlinedIcon} label={t('Entries')} value={s.count} caption={t('Voided ones not counted')} tone="blue" />
          <SummaryCard icon={CategoryOutlinedIcon} label={t('Biggest head')} value={top ? top.name : '—'} caption={top ? `${inr(top.amountPaise)} · ${s.totalPaise ? Math.round((top.amountPaise / s.totalPaise) * 100) : 0}%` : t('Nothing spent yet')} tone="gold" hideCaptionOnPhone={false} />
        </SummaryCards>
      )}
      <DataTable
        columns={columns}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered ? { title: t('No expenses match'), description: t('Try another date range or category.') } : { title: t('No expenses yet'), description: t('Add the shop’s costs as you pay them — they show in Profit & loss.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search description, reference or no.')} />
            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
              <TextField type="date" label={t('From')} value={list.filters.from} onChange={(e) => list.setFilter('from', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: { xs: '50%', md: 160 } }} />
              <TextField type="date" label={t('To')} value={list.filters.to} onChange={(e) => list.setFilter('to', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: { xs: '50%', md: 160 } }} />
            </Stack>
            <Stack direction="row" spacing={1.5} sx={{ flexShrink: 0 }}>
              <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Category')} value={list.filters.categoryId} onChange={(e) => list.setFilter('categoryId', e.target.value)} sx={{ width: { xs: '50%', md: 180 } }}>
                <MenuItem value="">{t('All categories')}</MenuItem>
                {categories.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Show')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ width: { xs: '50%', md: 140 } }}>
                <MenuItem value="">{t('All')}</MenuItem>
                <MenuItem value="active">{t('Active')}</MenuItem>
                <MenuItem value="void">{t('Voided')}</MenuItem>
              </TextField>
            </Stack>
          </Stack>
        }
      />
      <ExpenseFormDrawer open={Boolean(drawer)} expense={drawer && drawer !== 'new' ? drawer : null} onClose={() => setDrawer(null)} />
      <VoidDialog expense={voiding} onClose={() => setVoiding(null)} />
      <HistoryDialog expense={history} onClose={() => setHistory(null)} />
    </>
  );
}
