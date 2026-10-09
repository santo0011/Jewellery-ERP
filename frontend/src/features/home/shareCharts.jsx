import { Box, Stack, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { compactINR, niceMax, useWidth } from './charts.jsx';

// ---------------------------------------------------------------- categorical colours
// Fixed order (never cycled), validated (dataviz validator) for the light (#FFFFFF) and dark (#232220) card
// surfaces: CVD and normal-vision separation pass in both modes. Three light steps sit under 3:1, so every
// categorical chart here writes label, value and % next to its swatch (identity is never colour alone).
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];
const MAX_SLOTS = SERIES_LIGHT.length;

// Single-series mark colour shared with the column chart (validated light + dark).
const GOLD = '#9C7A16';
const GOLD_DARK = '#B38D1E';

/** Keeps the first slots and folds the rest into "Other", so no hue is ever generated. */
export function foldRows(rows, keep = MAX_SLOTS - 1) {
  if (rows.length <= MAX_SLOTS) return rows;
  const rest = rows.slice(keep);
  return [...rows.slice(0, keep), { key: '__other', label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0) }];
}
const seriesSx = (i, prop) => (theme) => ({ [prop]: SERIES_LIGHT[i], ...theme.applyStyles('dark', { [prop]: SERIES_DARK[i] }) });

function Legend({ rows, total, formatValue }) {
  return (
    <Stack spacing={1} sx={{ minWidth: 0, flex: 1, width: '100%' }}>
      {rows.map((r, i) => (
        <Stack key={r.key} direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box sx={(theme) => ({ width: 10, height: 10, borderRadius: '3px', flexShrink: 0, ...seriesSx(i, 'bgcolor')(theme) })} />
          <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {r.label}
            {r.caption && (
              <Typography component="span" variant="caption" color="textSecondary">
                {' '}
                · {r.caption}
              </Typography>
            )}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {formatValue(r.value)}
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {total ? Math.round((r.value / total) * 100) : 0}%
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

const Empty = ({ children }) => (
  <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
    {children}
  </Typography>
);

/**
 * Change over time as a filled line (single series). Hover anywhere for a crosshair and the exact value.
 * data: [{ key, label, value, detail }]
 */
export function AreaChart({ data, height = 240, formatValue = (v) => formatINR(v, { decimals: 0 }), formatAxis = compactINR, emptyLabel = 'No sales in this period' }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const pad = { top: 14, right: 12, bottom: 26, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const x = (i) => pad.left + (data.length > 1 ? i * step : innerW / 2);
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const allZero = data.every((d) => !d.value);
  const ticks = allZero ? [0] : [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 64)));
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ');
  const area = data.length ? `${line} L${x(data.length - 1)},${pad.top + innerH} L${x(0)},${pad.top + innerH} Z` : '';
  const hovered = active != null ? data[active] : null;

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - pad.left) / (step || 1));
    setActive(Math.max(0, Math.min(data.length - 1, i)));
  };

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%' }} onMouseLeave={() => setActive(null)}>
      <Box component="svg" width={width} height={height} role="img" aria-label="Sales trend" onMouseMove={onMove} sx={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="sales-area-fill" x1="0" y1="0" x2="0" y2="1">
            <Box component="stop" offset="0%" sx={(theme) => ({ stopColor: GOLD, stopOpacity: 0.28, ...theme.applyStyles('dark', { stopColor: GOLD_DARK, stopOpacity: 0.35 }) })} />
            <Box component="stop" offset="100%" sx={(theme) => ({ stopColor: GOLD, stopOpacity: 0, ...theme.applyStyles('dark', { stopColor: GOLD_DARK }) })} />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <Box component="line" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} sx={{ stroke: t === 0 ? 'text.disabled' : 'divider', strokeWidth: 1 }} />
            <Box component="text" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" sx={{ fontSize: 11, fill: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {formatAxis(t)}
            </Box>
          </g>
        ))}
        {!allZero && (
          <>
            <path d={area} fill="url(#sales-area-fill)" />
            <Box component="path" d={line} sx={(theme) => ({ fill: 'none', stroke: GOLD, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', ...theme.applyStyles('dark', { stroke: GOLD_DARK }) })} />
          </>
        )}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <Box key={d.key} component="text" x={x(i)} y={height - 8} textAnchor="middle" sx={{ fontSize: 11, fill: 'text.secondary' }}>
              {d.label}
            </Box>
          ) : null,
        )}
        {hovered && !allZero && (
          <g>
            <Box component="line" x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} sx={{ stroke: 'text.disabled', strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Box component="circle" cx={x(active)} cy={y(hovered.value)} r={5} sx={(theme) => ({ fill: GOLD, stroke: theme.palette.background.paper, strokeWidth: 2, ...theme.applyStyles('dark', { fill: GOLD_DARK }) })} />
          </g>
        )}
      </Box>
      {allZero && (
        <Typography variant="body2" color="textSecondary" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          {emptyLabel}
        </Typography>
      )}
      {hovered && !allZero && (
        <Box sx={{ position: 'absolute', top: 0, left: Math.min(Math.max(x(active), 80), width - 80), transform: 'translateX(-50%)', px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: 'background.paper', border: 1, borderColor: 'divider', boxShadow: 3, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {formatValue(hovered.value)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {hovered.detail ?? hovered.label}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/**
 * Share of a whole as a ring: the total in the middle (or the hovered part), a labelled legend beside it.
 * rows: [{ key, label, value }] - six slots at most; the rest fold into "Other".
 */
export function DonutChart({ rows: input, size = 156, thickness = 22, formatValue = (v) => formatINR(v, { decimals: 0 }), centerLabel = 'Total', empty = 'Nothing yet' }) {
  const [active, setActive] = useState(null);
  const rows = foldRows(input.filter((r) => r.value > 0));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return <Empty>{empty}</Empty>;

  const r = size / 2 - 2;
  const inner = r - thickness;
  const gap = rows.length > 1 ? 0.03 : 0; // ~2px surface gap between segments
  const point = (ang, rad) => [size / 2 + rad * Math.cos(ang), size / 2 + rad * Math.sin(ang)];
  let start = -Math.PI / 2;
  const arcs = rows.map((row, i) => {
    const sweep = (row.value / total) * Math.PI * 2;
    const a0 = start + gap / 2;
    const a1 = start + Math.max(sweep - gap / 2, gap / 2 + 0.001);
    start += sweep;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = point(a0, r);
    const [x1, y1] = point(a1, r);
    const [x2, y2] = point(a1, inner);
    const [x3, y3] = point(a0, inner);
    return { row, i, d: `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${inner},${inner} 0 ${large} 0 ${x3},${y3} Z` };
  });
  const shown = active != null ? rows[active] : null;

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ alignItems: 'center' }}>
      <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }} onMouseLeave={() => setActive(null)}>
        <svg width={size} height={size} role="img" aria-label="Share of total">
          {rows.length === 1 ? (
            <Box component="circle" cx={size / 2} cy={size / 2} r={r - thickness / 2} sx={(theme) => ({ fill: 'none', strokeWidth: thickness, ...seriesSx(0, 'stroke')(theme) })} />
          ) : (
            arcs.map(({ row, i, d }) => (
              <Box
                key={row.key}
                component="path"
                d={d}
                tabIndex={0}
                aria-label={`${row.label}: ${formatValue(row.value)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                sx={(theme) => ({ ...seriesSx(i, 'fill')(theme), opacity: active == null || active === i ? 1 : 0.35, transition: 'opacity 120ms', outline: 'none' })}
              />
            ))
          )}
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', pointerEvents: 'none' }}>
          <Box sx={{ maxWidth: inner * 1.6 }}>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{compactINR(shown ? shown.value : total)}</Typography>
            <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block' }}>
              {shown ? shown.label : centerLabel}
            </Typography>
          </Box>
        </Box>
      </Box>
      <Legend rows={rows} total={total} formatValue={formatValue} />
    </Stack>
  );
}

/**
 * One 100% bar split into parts (composition at a glance), with a labelled legend underneath.
 * rows: [{ key, label, value, caption }]
 */
export function StackedBar({ rows: input, formatValue = (v) => String(v), height = 14, empty = 'Nothing yet' }) {
  const rows = foldRows(input.filter((r) => r.value > 0));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return <Empty>{empty}</Empty>;
  return (
    <Box>
      <Stack direction="row" sx={{ height, gap: '2px', mb: 2 }}>
        {rows.map((r, i) => (
          <Box
            key={r.key}
            title={`${r.label}: ${formatValue(r.value)} (${Math.round((r.value / total) * 100)}%)`}
            sx={(theme) => ({
              flex: `${r.value} 0 0`,
              minWidth: 4,
              ...seriesSx(i, 'bgcolor')(theme),
              '&:first-of-type': { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
              '&:last-of-type': { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
            })}
          />
        ))}
      </Stack>
      <Legend rows={rows} total={total} formatValue={formatValue} />
    </Box>
  );
}
