import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Box, Button, ButtonBase, Card, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import { t } from '../../i18n/index.js';

/** Gold for the dashboard's own marks (bars, badges); the brighter shade in dark mode. */
export const goldBg = (theme) => ({ bgcolor: 'var(--brand-strong)', ...theme.applyStyles('dark', { bgcolor: 'var(--brand-mark)' }) });

/** A dashboard panel: an icon tile, title and a short line on what it shows; an action (link) on the right. */
export function Panel({ icon: Icon, title, subtitle, action, children }) {
  return (
    <Card sx={{ height: '100%', borderRadius: 3, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', px: { xs: 1.75, sm: 2.25 }, pt: { xs: 1.75, sm: 2 }, pb: { xs: 1.25, sm: 1.5 } }}>
        {Icon && (
          <Box sx={{ width: 34, height: 34, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(var(--brand-rgb), 0.12)', color: 'var(--brand-strong)' }}>
            <Icon sx={{ fontSize: 18 }} />
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 700, fontSize: { xs: '0.9375rem', sm: '1rem' }, lineHeight: 1.25 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="textSecondary" noWrap component="div" sx={{ lineHeight: 1.35 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      <Box sx={{ px: { xs: 1.75, sm: 2.25 }, pb: { xs: 1.75, sm: 2.25 }, flex: 1 }}>{children}</Box>
    </Card>
  );
}

/** "See all →" in a panel's header. */
export function PanelLink({ to, children }) {
  return (
    <Button component={RouterLink} to={to} size="small" endIcon={<ArrowForwardRoundedIcon sx={{ fontSize: '16px !important' }} />} sx={{ flexShrink: 0, fontWeight: 600, color: 'var(--brand-strong)', px: 1, minWidth: 0 }}>
      {children}
    </Button>
  );
}

/** A pill switch for the period: the chosen one lifts out of the track. `onDark`: on a dark banner. */
export function PeriodSwitch({ value, options, onChange, short, onDark }) {
  return (
    <Box role="tablist" aria-label={t('Period')} sx={{ display: 'flex', p: 0.5, gap: 0.5, borderRadius: 999, width: { xs: '100%', sm: 'auto' }, border: 1, ...(onDark ? { bgcolor: 'rgba(247, 243, 232, 0.06)', borderColor: 'rgba(247, 243, 232, 0.2)' } : { bgcolor: 'action.hover', borderColor: 'divider' }) }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <ButtonBase
            key={o.value}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            sx={(theme) => ({
              flex: { xs: 1, sm: 'none' },
              px: { xs: 1, sm: 2 },
              py: 0.75,
              borderRadius: 999,
              fontSize: '0.8125rem',
              fontWeight: on ? 700 : 500,
              color: on ? 'var(--brand-contrast)' : onDark ? 'rgba(247, 243, 232, 0.7)' : 'text.secondary',
              transition: 'background-color .15s, color .15s, box-shadow .15s',
              ...(on ? { background: 'linear-gradient(135deg, var(--brand-light) 0%, var(--brand) 55%, var(--brand-deep) 100%)', boxShadow: '0 4px 12px -4px rgba(var(--brand-rgb), 0.6)' } : { '&:hover': { color: onDark ? '#F7F3E8' : theme.palette.text.primary } }),
            })}
          >
            {short && o.short ? o.short : o.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

/** Two letters for a name ("Rupa Sen" → "RS"), in a round badge. */
export function Initials({ name, size = 34 }) {
  const text = String(name ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
  return (
    <Box sx={{ width: size, height: size, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: size * 0.36, fontWeight: 700, color: 'var(--brand-strong)', bgcolor: 'rgba(var(--brand-rgb), 0.12)', border: '1px solid rgba(var(--brand-rgb), 0.3)' }}>
      {text || '?'}
    </Box>
  );
}

/** A thin share bar (0–1). */
export function ShareBar({ share, tone }) {
  return (
    <Box sx={{ height: 6, borderRadius: 999, bgcolor: 'action.hover', overflow: 'hidden' }}>
      <Box sx={(theme) => ({ width: `${Math.max(2, Math.round(share * 100))}%`, height: '100%', borderRadius: 999, transition: 'width .3s', ...(tone ? { bgcolor: tone } : goldBg(theme)) })} />
    </Box>
  );
}

/**
 * Ranked rows: number badge, name, value, a share bar and a caption under the name.
 * rows: [{ key, label, value, caption, to }]
 */
export function RankList({ rows, formatValue, empty, avatar }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <Stack spacing={1.5}>
      {rows.map((r, i) => (
        <Stack key={r.key} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          {avatar ? (
            <Initials name={r.label} size={32} />
          ) : (
            <Box sx={(theme) => ({ width: 24, height: 24, flexShrink: 0, borderRadius: 1.5, display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 800, ...(i === 0 ? { ...goldBg(theme), color: 'var(--brand-contrast)' } : { bgcolor: 'action.hover', color: 'text.secondary' }) })}>{i + 1}</Box>
          )}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
              <Typography variant="body2" noWrap component={r.to ? RouterLink : 'span'} to={r.to} sx={{ fontWeight: 600, color: 'text.primary', textDecoration: 'none', '&:hover': r.to ? { textDecoration: 'underline' } : undefined }}>
                {r.label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(r.value)}
              </Typography>
            </Stack>
            <ShareBar share={r.value / max} />
            {r.caption && (
              <Typography variant="caption" color="textSecondary" component="div" sx={{ mt: 0.25 }}>
                {r.caption}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

export function EmptyNote({ children }) {
  return (
    <Box sx={{ py: 4, textAlign: 'center', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
      <Typography variant="body2" color="textSecondary">
        {children}
      </Typography>
    </Box>
  );
}

/** A small tinted figure: value over its label. */
export function StatTile({ label, value, tone }) {
  return (
    <Box sx={{ flex: '1 1 0', minWidth: 0, px: 1.5, py: 1.25, borderRadius: 2, bgcolor: 'rgba(var(--brand-rgb), 0.07)', border: '1px solid rgba(var(--brand-rgb), 0.18)' }}>
      <Typography noWrap sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', sm: '1.25rem' }, lineHeight: 1.15, fontVariantNumeric: 'tabular-nums', color: tone ?? 'text.primary' }}>
        {value}
      </Typography>
      <Typography variant="caption" color="textSecondary" noWrap component="div">
        {label}
      </Typography>
    </Box>
  );
}
