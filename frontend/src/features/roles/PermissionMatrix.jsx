import { Box, Card, Checkbox, Divider, FormControlLabel, Stack, Typography } from '@mui/material';
import { PERMISSION_MODULES } from '@jerp/shared';
import { Fragment, useMemo } from 'react';

const groupModules = (only) =>
  PERMISSION_MODULES.filter((m) => !only || only.includes(m.key)).reduce((acc, m) => {
    (acc[m.group] ??= []).push(m);
    return acc;
  }, {});

const keysOf = (module) => Object.keys(module.actions).map((a) => `${module.key}.${a}`);

export default function PermissionMatrix({ value, onChange, disabled = false, modules: only }) {
  const selected = useMemo(() => new Set(value), [value]);
  const GROUPS = useMemo(() => groupModules(only), [only]);

  const toggle = (keys, on) => {
    const next = new Set(selected);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    onChange([...next]);
  };

  return (
    <Stack spacing={2}>
      {Object.entries(GROUPS).map(([group, modules]) => (
        <Card key={group}>
          <Box sx={{ px: 2, py: 1.25, bgcolor: 'soft.main' }}>
            <Typography variant="overline" color="textSecondary">
              {group}
            </Typography>
          </Box>
          <Divider />
          {modules.map((m, i) => {
            const keys = keysOf(m);
            const count = keys.filter((k) => selected.has(k)).length;
            return (
              <Fragment key={m.key}>
                {i > 0 && <Divider />}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '220px 1fr' }, gap: { xs: 0.5, md: 2 }, px: 2, py: 1.25, alignItems: 'start' }}>
                  <FormControlLabel
                    disabled={disabled}
                    control={
                      <Checkbox
                        size="small"
                        checked={count === keys.length}
                        indeterminate={count > 0 && count < keys.length}
                        onChange={(e) => toggle(keys, e.target.checked)}
                      />
                    }
                    label={m.label}
                    slotProps={{ typography: { sx: { fontWeight: 600, fontSize: '0.875rem' } } }}
                  />
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, pl: { xs: 3.5, md: 0 } }}>
                    {Object.entries(m.actions).map(([action, label]) => {
                      const key = `${m.key}.${action}`;
                      return (
                        <FormControlLabel
                          key={key}
                          disabled={disabled}
                          control={<Checkbox size="small" checked={selected.has(key)} onChange={(e) => toggle([key], e.target.checked)} />}
                          label={label}
                          slotProps={{ typography: { variant: 'body2' } }}
                        />
                      );
                    })}
                  </Box>
                </Box>
              </Fragment>
            );
          })}
        </Card>
      ))}
    </Stack>
  );
}
