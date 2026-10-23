import { Box, Stack, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { compactINR, niceMax, useWidth } from '../home/charts.jsx';
import { seriesSx } from '../home/shareCharts.jsx';
import { t } from '../../i18n/index.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const AXIS = { fontSize: 11, fill: 'var(--mui-palette-text-secondary)', fontVariantNumeric: 'tabular-nums' };
// Column with a 4px rounded top and a square base.
const roundedTop = (x, top, w, h, base) => {
  const r = Math.min(4, w / 2, h);
  return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
};

/**
 * Columns over time, each split into a few parts stacked from the baseline (categorical slots in fixed order, a 2px
 * surface gap between parts, only the top part rounded). A legend with each part's total sits above; hover or focus
 * a column for its exact figures.
 * series: [{ key, label }] · data: [{ key, label, [series.key]: value, detail }]
 */
export function StackedColumnChart({ series, data, height = 240, formatValue = inr, formatAxis = compactINR, emptyLabel = t('Nothing yet') }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const pad = { top: 12, right: 8, bottom: 26, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const totalOf = (d) => series.reduce((s, x) => s + (d[x.key] ?? 0), 0);
  const max = niceMax(Math.max(0, ...data.map(totalOf)));
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(24, slot - 6));
  const base = pad.top + innerH;
  const scale = (v) => (v / max) * innerH;
  const allZero = data.every((d) => !totalOf(d));
  const ticks = allZero ? [0] : [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 44)));
  const hovered = active != null ? data[active] : null;
  const totals = Object.fromEntries(series.map((s) => [s.key, data.reduce((n, d) => n + (d[s.key] ?? 0), 0)]));

  return (
    <Box>
      <Stack direction="row" sx={{ gap: { xs: 2, sm: 3 }, flexWrap: 'wrap', mb: 1.5 }}>
        {series.map((s, i) => (
          <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={(theme) => ({ width: 10, height: 10, borderRadius: '3px', ...seriesSx(i, 'bgcolor')(theme) })} />
            <Typography variant="body2" color="textSecondary">
              {s.label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {formatValue(totals[s.key])}
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Box ref={ref} sx={{ position: 'relative', width: '100%' }} onMouseLeave={() => setActive(null)}>
        <Box component="svg" width={width} height={height} role="img" aria-label={t('{{series}} by month', { series: series.map((s) => s.label).join(' · ') })} sx={{ display: 'block', overflow: 'visible' }}>
          {ticks.map((tick) => (
            <g key={tick}>
              <Box component="line" x1={pad.left} x2={width - pad.right} y1={base - scale(tick)} y2={base - scale(tick)} sx={{ stroke: tick === 0 ? 'var(--mui-palette-text-disabled)' : 'var(--mui-palette-divider)', strokeWidth: 1 }} />
              <Box component="text" x={pad.left - 8} y={base - scale(tick)} dy="0.32em" textAnchor="end" sx={AXIS}>
                {formatAxis(tick)}
              </Box>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.left + i * slot + (slot - barW) / 2;
            const parts = series.map((s, si) => ({ si, h: scale(d[s.key] ?? 0) })).filter((p) => p.h > 0);
            let y = base;
            return (
              <g key={d.key} style={{ opacity: active == null || active === i ? 1 : 0.45, transition: 'opacity 120ms' }}>
                {parts.map((p, n) => {
                  const top = n === parts.length - 1;
                  // The 2px gap is taken from the lower part, so the column keeps its true total height.
                  const h = Math.max(1, top ? p.h : p.h - 2);
                  const segTop = y - h;
                  const path = top ? roundedTop(x, segTop, barW, h, y) : `M${x},${y} V${segTop} H${x + barW} V${y} Z`;
                  y -= p.h;
                  return <Box key={p.si} component="path" d={path} sx={seriesSx(p.si, 'fill')} />;
                })}
                <rect
                  x={pad.left + i * slot}
                  y={pad.top}
                  width={slot}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.label}: ${series.map((s) => `${s.label} ${formatValue(d[s.key] ?? 0)}`).join(', ')}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  style={{ outline: 'none' }}
                />
                {i % labelEvery === 0 && (
                  <Box component="text" x={pad.left + i * slot + slot / 2} y={height - 8} textAnchor="middle" sx={{ fontSize: 11, fill: 'var(--mui-palette-text-secondary)' }}>
                    {d.label}
                  </Box>
                )}
              </g>
            );
          })}
        </Box>
        {allZero && (
          <Typography variant="body2" color="textSecondary" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            {emptyLabel}
          </Typography>
        )}
        {hovered && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: Math.min(Math.max(pad.left + active * slot + slot / 2, 90), width - 90),
              transform: 'translateX(-50%)',
              px: 1.25,
              py: 0.75,
              minWidth: 150,
              borderRadius: 1.5,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              boxShadow: 3,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 0.5 }}>
              {hovered.label}
              {hovered.detail ? ` · ${hovered.detail}` : ''}
            </Typography>
            {series.map((s, i) => (
              <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={(theme) => ({ width: 8, height: 8, borderRadius: '2px', ...seriesSx(i, 'bgcolor')(theme) })} />
                  <Typography variant="caption">{s.label}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {formatValue(hovered[s.key] ?? 0)}
                </Typography>
              </Stack>
            ))}
            <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5, pt: 0.5, borderTop: 1, borderColor: 'divider' }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {t('Total')}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                {formatValue(totalOf(hovered))}
              </Typography>
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * A share of a whole as a filled track: the label and "part of whole" written out, the fill in the single-series gold,
 * the track a light step of the same hue.
 */
export function Meter({ label, part, whole, caption }) {
  const pct = whole ? Math.round((part / whole) * 100) : 0;
  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75, gap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 800 }}>
          {pct}%
        </Typography>
      </Stack>
      <Box role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(var(--brand-rgb), 0.16)', overflow: 'hidden' }}>
        <Box sx={(theme) => ({ height: '100%', width: `${pct}%`, borderRadius: 4, bgcolor: 'var(--brand-strong)', transition: 'width 300ms ease', ...theme.applyStyles('dark', { bgcolor: 'var(--brand-mark)' }) })} />
      </Box>
      {caption && (
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
          {caption}
        </Typography>
      )}
    </Box>
  );
}

/** Change against a reference, written out with an arrow (never colour alone). Up is good. */
export function Delta({ now, before, suffix }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', color: up ? 'success.main' : 'error.main', bgcolor: up ? 'rgba(46, 107, 79, 0.10)' : 'rgba(155, 44, 44, 0.08)' }}>
      {up ? '▲' : '▼'} {Math.abs(pct)}% {suffix}
    </Box>
  );
}
