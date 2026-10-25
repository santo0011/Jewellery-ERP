import { Autocomplete, Box, Chip, IconButton, Stack, TextField, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { formatINR, formatWeight } from '@jerp/shared';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce.js';
import { useProductListQuery } from '../products/productApi.js';
import { purityLabel } from '../products/productForm.js';
import { t } from '../../i18n/index.js';

export function SelectedProducts({ products, onRemove, showCost }) {
  if (!products.length) return null;
  const totals = products.reduce((acc, p) => ({ gross: acc.gross + p.grossWeightMg, fine: acc.fine + p.fineWeightMg, cost: acc.cost + (p.costPricePaise ?? 0) }), { gross: 0, fine: 0, cost: 0 });
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      {products.map((p) => (
        <Stack key={p.id} direction="row" spacing={1} sx={{ px: 1.5, py: 1, alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {p.sku} · {p.name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {t('{{metal}} · {{grossWeight}} gross · {{netWeight}} net', { metal: purityLabel(p.metal, p.purity), grossWeight: formatWeight(p.grossWeightMg), netWeight: formatWeight(p.netWeightMg) })}
              {showCost && p.costPricePaise ? ` · ${formatINR(p.costPricePaise, { decimals: 0 })}` : ''}
            </Typography>
          </Box>
          {onRemove && (
            <IconButton size="small" onClick={() => onRemove(p.id)} aria-label={t('Remove {{sku}}', { sku: p.sku })}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}
      <Stack direction="row" spacing={2} sx={{ px: 1.5, py: 1, bgcolor: 'soft.main', flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {(products.length === 1 ? t('{{count}} item', { count: products.length }) : t('{{count}} items', { count: products.length }))}
        </Typography>
        <Typography variant="body2">{t('Gross {{gross}}', { gross: formatWeight(totals.gross) })}</Typography>
        <Typography variant="body2">{t('Fine {{fine}}', { fine: formatWeight(totals.fine) })}</Typography>
        {showCost && totals.cost > 0 && <Typography variant="body2">{t('Cost {{cost}}', { cost: formatINR(totals.cost, { decimals: 0 }) })}</Typography>}
      </Stack>
    </Box>
  );
}

export default function ProductPicker({ status, branchId, selected, onAdd, label = t('Add item by SKU, HUID or name'), error }) {
  const [input, setInput] = useState('');
  const q = useDebounce(input.trim(), 250);
  const { data, isFetching } = useProductListQuery({ page: 1, limit: 20, status, ...(branchId && { branchId }), ...(q && { q }) }, { skip: !branchId });
  const chosen = new Set(selected.map((p) => String(p.id)));
  const options = (data?.items ?? []).filter((p) => !chosen.has(String(p.id)));

  return (
    <Autocomplete
      options={options}
      loading={isFetching}
      value={null}
      inputValue={input}
      onInputChange={(e, value, reason) => reason !== 'reset' && setInput(value)}
      onChange={(e, product) => {
        if (product) {
          onAdd(product);
          setInput('');
        }
      }}
      filterOptions={(x) => x}
      getOptionLabel={(p) => `${p.sku} ${p.name}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={branchId ? (q ? t('No matching items') : t('No eligible items at this branch')) : t('Select a branch first')}
      disabled={!branchId}
      renderOption={({ key, ...props }, p) => (
        <Box component="li" key={key} {...props}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {p.sku} · {p.name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {purityLabel(p.metal, p.purity)} · {formatWeight(p.grossWeightMg)}
              {p.huid && t(' · HUID {{huid}}', { huid: p.huid })}
            </Typography>
          </Box>
          {p.stockType === 'lot' && <Chip size="small" label={t('{{quantity}} pcs', { quantity: p.quantity })} sx={{ ml: 'auto', height: 20 }} />}
        </Box>
      )}
      renderInput={(params) => <TextField {...params} label={label} error={Boolean(error)} helperText={error ?? t('Scan a barcode or type to search')} />}
    />
  );
}
