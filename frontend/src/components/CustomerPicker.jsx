import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import { Autocomplete, Box, Button, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import CustomerFormDrawer from '../features/customers/CustomerFormDrawer.jsx';
import { useCustomerListQuery } from '../features/customers/customerApi.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { usePermission } from '../hooks/usePermission.js';

const labelOf = (c) => `${c.name} · ${c.mobile}`;

/** Search customers by name, mobile or code, with a quick "New customer" for walk-ins. */
export default function CustomerPicker({ value, onChange, label = 'Customer', error, helperText, disabled, autoFocus }) {
  const [input, setInput] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = usePermission('customer.create');
  // Once a customer is chosen the box shows their label; that label is not a search.
  const typed = input.trim() === (value ? labelOf(value) : '') ? '' : input.trim();
  const q = useDebounce(typed, 250);
  const { data, isFetching } = useCustomerListQuery({ page: 1, limit: 20, status: 'active', ...(q && { q }) });
  const options = data?.items ?? [];

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Autocomplete
          sx={{ flex: 1 }}
          options={value && !options.some((o) => o.id === value.id) ? [value, ...options] : options}
          value={value ?? null}
          loading={isFetching}
          disabled={disabled}
          inputValue={input}
          onInputChange={(e, v) => setInput(v)}
          onChange={(e, customer) => onChange(customer)}
          filterOptions={(x) => x}
          getOptionLabel={labelOf}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText={q ? 'No matching customers' : 'Type a name or mobile number'}
          renderOption={({ key, ...props }, c) => (
            <Box component="li" key={key} {...props}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {c.name}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {c.code} · {c.mobile}
                  {c.address?.city ? ` · ${c.address.city}` : ''}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => <TextField {...params} label={label} placeholder="Search name or mobile" error={Boolean(error)} helperText={error ?? helperText} autoFocus={autoFocus} />}
        />
        {canCreate && !disabled && (
          <Button variant="outlined" onClick={() => setCreating(true)} startIcon={<PersonAddAlt1OutlinedIcon />} sx={{ flexShrink: 0, height: 41 }}>
            New
          </Button>
        )}
      </Stack>
      <CustomerFormDrawer open={creating} onClose={() => setCreating(false)} onCreated={(c) => onChange(c)} />
    </>
  );
}
