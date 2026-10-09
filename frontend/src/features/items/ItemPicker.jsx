import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import { Autocomplete, Box, Chip, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce.js';
import { usePermission } from '../../hooks/usePermission.js';
import { tokens } from '../../theme/tokens.js';
import ItemFormDrawer from './ItemFormDrawer.jsx';
import { useItemListQuery } from './itemApi.js';

const ADD = '__add_item__';

/**
 * Search saved items and pick one. When nothing matches (or the item is new), "Add … as a new item" opens the
 * item form pre-filled with what was typed; the saved item is picked straight away.
 * `onPick(item)` runs on every pick; the box clears itself so the next item can be added.
 */
export default function ItemPicker({ onPick, label = 'Search items — name or code', size = 'medium', helperText }) {
  const canAdd = usePermission(['purchase.create', 'product.create']);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(null);
  const q = useDebounce(input.trim(), 200);
  const { data, isFetching } = useItemListQuery({ limit: 15, status: 'active', ...(q && { q }) });
  const items = data?.items ?? [];
  const options = canAdd && q ? [...items, { id: ADD, name: q }] : items;

  return (
    <>
      <Autocomplete
        size={size}
        options={options}
        loading={isFetching}
        value={null}
        inputValue={input}
        onInputChange={(e, v, reason) => reason !== 'reset' && setInput(v)}
        onChange={(e, opt) => {
          if (!opt) return;
          if (opt.id === ADD) setAdding(opt.name);
          else onPick(opt);
          setInput('');
        }}
        filterOptions={(x) => x}
        getOptionLabel={(o) => o.name ?? ''}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={q ? 'No item found' : 'Type to search saved items'}
        renderOption={({ key, ...props }, o) =>
          o.id === ADD ? (
            <Box component="li" key={key} {...props} sx={{ borderTop: items.length ? 1 : 0, borderColor: 'divider', color: tokens.light.goldDark }}>
              <AddCircleOutlineRoundedIcon fontSize="small" sx={{ mr: 1 }} />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Add “{o.name}” as a new item
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
        renderInput={(params) => <TextField {...params} label={label} helperText={helperText ?? (canAdd ? 'Not in the list? Type the name and add it.' : ' ')} />}
      />
      <ItemFormDrawer open={adding !== null} defaultName={adding ?? ''} onClose={() => setAdding(null)} onSaved={onPick} />
    </>
  );
}
