import { Box, Tab, Tabs, useMediaQuery } from '@mui/material';

function Count({ value, on }) {
  return (
    <Box component="span" sx={{ px: 0.75, minWidth: 18, borderRadius: 10, fontSize: '0.6875rem', fontWeight: 700, lineHeight: '18px', textAlign: 'center', bgcolor: on ? 'rgba(var(--brand-rgb), 0.14)' : 'action.selected', color: on ? 'primary.dark' : 'text.secondary' }}>
      {value}
    </Box>
  );
}

/**
 * The views of a page (Details / History / …): tabs under a line, with a gold underline on the open one. Phones use
 * the same bar, app style — one line that slides sideways, short labels and tighter spacing; the open tab scrolls
 * into view.
 *
 * items: [{ value, label, short?, icon?, count? }] — `short` is the label on phones, `count` a number badge;
 * leave out the views the person cannot open (falsy entries are skipped).
 */
export default function ViewTabs({ value, onChange, items, sx }) {
  const views = items.filter(Boolean);
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  return (
    <Box sx={{ mb: 2, ...sx }}>
      <Tabs
        value={value}
        onChange={(e, v) => onChange(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{ borderBottom: 1, borderColor: 'divider', minHeight: { xs: 42, sm: 48 }, '& .MuiTabs-indicator': { height: 3, borderRadius: '3px 3px 0 0' } }}
      >
        {views.map(({ value: v, label, short, icon: Icon, count }) => {
          const text = phone ? (short ?? label) : label;
          return (
            <Tab
              key={v}
              value={v}
              icon={Icon ? <Icon fontSize="small" /> : undefined}
              iconPosition="start"
              label={
                count == null ? (
                  text
                ) : (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: { xs: 0.75, sm: 1 } }}>
                    {text}
                    <Count value={count} on={v === value} />
                  </Box>
                )
              }
              sx={{ minHeight: { xs: 42, sm: 44 }, minWidth: { xs: 0, sm: 90 }, px: { xs: 1.5, sm: 2 }, textTransform: 'none', fontWeight: 600, fontSize: { xs: '0.8125rem', sm: '0.875rem' }, whiteSpace: 'nowrap' }}
            />
          );
        })}
      </Tabs>
    </Box>
  );
}
