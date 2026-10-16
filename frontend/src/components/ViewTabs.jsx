import { Box, ButtonBase, Tab, Tabs } from '@mui/material';

/** Phones: up to three switches a row — 4 views make a 2 × 2 block, 5 or 6 make rows of three. */
const phoneColumns = (n) => (n <= 3 ? n : n === 4 ? 2 : 3);

function Count({ value, on }) {
  return (
    <Box component="span" sx={{ px: 0.75, minWidth: 18, borderRadius: 10, fontSize: '0.6875rem', fontWeight: 700, lineHeight: '18px', textAlign: 'center', bgcolor: on ? 'rgba(var(--brand-rgb), 0.14)' : 'action.selected', color: on ? 'primary.dark' : 'text.secondary' }}>
      {value}
    </Box>
  );
}

/**
 * The views of a page (Details / History / …). Desktop: tabs under a line. Phones: a segmented switch with every view
 * in sight — scrolling tabs cut the last one off and hid the rest behind an arrow.
 *
 * items: [{ value, label, short?, icon?, count? }] — `short` is the label on phones, `count` a number badge;
 * leave out the views the person cannot open (falsy entries are skipped).
 */
export default function ViewTabs({ value, onChange, items, sx }) {
  const views = items.filter(Boolean);
  return (
    <Box sx={{ mb: 2, ...sx }}>
      <Tabs value={value} onChange={(e, v) => onChange(v)} variant="scrollable" sx={{ borderBottom: 1, borderColor: 'divider', display: { xs: 'none', sm: 'flex' } }}>
        {views.map(({ value: v, label, icon: Icon, count }) => (
          <Tab
            key={v}
            value={v}
            icon={Icon ? <Icon fontSize="small" /> : undefined}
            iconPosition="start"
            label={
              count == null ? (
                label
              ) : (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                  {label}
                  <Count value={count} on={v === value} />
                </Box>
              )
            }
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
          />
        ))}
      </Tabs>

      <Box
        role="tablist"
        sx={{ display: { xs: 'grid', sm: 'none' }, gridTemplateColumns: `repeat(${phoneColumns(views.length)}, minmax(0, 1fr))`, gap: 0.5, p: 0.5, borderRadius: 3, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}
      >
        {views.map(({ value: v, label, short, icon: Icon, count }) => {
          const on = v === value;
          return (
            <ButtonBase
              key={v}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(v)}
              sx={{
                gap: 0.6,
                px: 0.75,
                py: 0.9,
                minWidth: 0,
                borderRadius: 2.5,
                fontSize: '0.8125rem',
                fontWeight: on ? 700 : 600,
                color: on ? 'primary.dark' : 'text.secondary',
                bgcolor: on ? 'background.paper' : 'transparent',
                boxShadow: on ? '0 1px 3px rgba(23, 23, 23, 0.12)' : 'none',
                transition: 'all 150ms ease',
              }}
            >
              {Icon && <Icon sx={{ fontSize: 17, flexShrink: 0, color: on ? 'primary.main' : 'inherit' }} />}
              <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {short ?? label}
              </Box>
              {count != null && <Count value={count} on={on} />}
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
