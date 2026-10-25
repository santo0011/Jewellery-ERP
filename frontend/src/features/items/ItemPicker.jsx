import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce.js';
import { usePermission } from '../../hooks/usePermission.js';
import { tokens } from '../../theme/tokens.js';
import ItemFormDrawer from './ItemFormDrawer.jsx';
import { useItemListQuery } from './itemApi.js';
import { t } from '../../i18n/index.js';

const ADD = '__add_item__';

/**
 * Search saved items and pick one. When nothing matches (or the item is new), "Add … as a new item" opens the
 * item form pre-filled with what was typed; the saved item is picked straight away.
 * `onPick(item)` runs on every pick; the box clears itself so the next item can be added.
 * With `value` it is a select instead: it shows the picked item, and text typed but not picked is dropped when the
 * box loses focus, so only a saved item can be chosen. Clearing it calls `onPick(null)`.
 */
export default function ItemPicker({ onPick, value, label = t('Search items — name or code'), size = 'medium', helperText, error = false }) {
  const selecting = value !== undefined;
  const canAdd = usePermission('purchase.create');
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(null);
  // While the box shows the picked item's name, list every item rather than only that one.
  const q = useDebounce(selecting && value && input === value.name ? '' : input.trim(), 200);
  const { data, isFetching } = useItemListQuery({ limit: 15, status: 'active', ...(q && { q }) });
  const found = data?.items ?? [];
  const items = selecting && value && !found.some((i) => i.id === value.id) ? [value, ...found] : found;
  const options = canAdd && q ? [...items, { id: ADD, name: q }] : items;

  return (
    <>
      <Autocomplete
        size={size}
        options={options}
        loading={isFetching}
        value={selecting ? value : null}
        inputValue={input}
        onInputChange={(e, v, reason) => (reason !== 'reset' || selecting) && setInput(v)}
        onChange={(e, opt) => {
          if (!opt) return selecting && onPick(null);
          if (opt.id === ADD) setAdding(opt.name);
          else onPick(opt);
          if (!selecting) setInput('');
        }}
        filterOptions={(x) => x}
        getOptionLabel={(o) => o.name ?? ''}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={q ? t('No item found') : t('Type to search saved items')}
        renderOption={({ key, ...props }, o) =>
          o.id === ADD ? (
            <Box component="li" key={key} {...props} sx={{ borderTop: items.length ? 1 : 0, borderColor: 'divider', color: tokens.brand.strong }}>
              <AddCircleOutlineRoundedIcon fontSize="small" sx={{ mr: 1 }} />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {t('Add “{{name}}” as a new item', { name: o.name })}
              </Typography>
            </Box>
          ) : (
            <Box component="li" key={key} {...props}>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {o.name}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {o.code} · {o.category?.name ?? '—'} · {o.jewelleryTypeLabel}
                </Typography>
              </Box>
              <Chip size="small" label={o.purityLabel} sx={{ ml: 1, height: 20, fontWeight: 600 }} />
            </Box>
          )
        }
        renderInput={(params) => <TextField {...params} label={label} error={error} helperText={helperText ?? (canAdd ? t('Not in the list? Type the name and add it.') : ' ')} />}
      />
      <ItemFormDrawer open={adding !== null} defaultName={adding ?? ''} onClose={() => setAdding(null)} onSaved={onPick} />
    </>
  );
}
