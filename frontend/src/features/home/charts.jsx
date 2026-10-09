import { Box, Stack, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useEffect, useRef, useState } from 'react';

// Single-series mark colour, validated (dataviz validator) against the card surface:
// light #9C7A16 on #FFFFFF, dark #B38D1E on #232220 - both pass band, chroma and 3:1 contrast.
const markSx = (theme) => ({ fill: '#9C7A16', ...theme.applyStyles('dark', { fill: '#B38D1E' }) });
const barBg = (theme) => ({ bgcolor: '#9C7A16', ...theme.applyStyles('dark', { bgcolor: '#B38D1E' }) });

/** ₹45K, ₹1.2L, ₹3.4Cr - for axes and tight labels; tooltips show the exact amount. */
export function compactINR(paise) {
  const r = (paise ?? 0) / 100;
  if (Math.abs(r) >= 1e7) return `₹${Number((r / 1e7).toFixed(1))}Cr`;
  if (Math.abs(r) >= 1e5) return `₹${Number((r / 1e5).toFixed(1))}L`;
  if (Math.abs(r) >= 1e3) return `₹${Number((r / 1e3).toFixed(1))}K`;
  return `₹${Math.round(r)}`;
}

export function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

export const niceMax = (v) => {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= v);
};

/**
 * Columns over time (one per day). Hover or focus a column for its exact value.
 * data: [{ key, label, value, detail }]
 */
export function ColumnChart({ data, height = 220, formatValue = (v) => formatINR(v, { decimals: 0 }), formatAxis = compactINR, emptyLabel = 'No sales in this period' }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const pad = { top: 12, right: 8, bottom: 26, left: 52 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(28, slot - 2));
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const allZero = data.every((d) => !d.value);
  // With nothing to plot, draw only the baseline (no stack of ₹0 ticks).
  const ticks = allZero ? [0] : [0, max / 2, max];
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56)));
  const hovered = active != null ? data[active] : null;

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%' }} onMouseLeave={() => setActive(null)}>
      <Box component="svg" width={width} height={height} role="img" aria-label="Daily sales" sx={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((t) => (
          <g key={t}>
            <Box component="line" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} sx={{ stroke: t === 0 ? 'text.disabled' : 'divider', strokeWidth: 1 }} />
            <Box component="text" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" sx={{ fontSize: 11, fill: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {formatAxis(t)}
            </Box>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2;
          const h = Math.max(d.value > 0 ? 2 : 0, (d.value / max) * innerH);
          const r = Math.min(4, barW / 2, h);
          // Rounded top, square base anchored to the axis.
          const path = h > 0 ? `M${x},${pad.top + innerH} V${pad.top + innerH - h + r} Q${x},${pad.top + innerH - h} ${x + r},${pad.top + innerH - h} H${x + barW - r} Q${x + barW},${pad.top + innerH - h} ${x + barW},${pad.top + innerH - h + r} V${pad.top + innerH} Z` : null;
          return (
            <g key={d.key}>
              {path && <Box component="path" d={path} sx={(theme) => ({ ...markSx(theme), opacity: active == null || active === i ? 1 : 0.45, transition: 'opacity 120ms' })} />}
              {/* Hit target is the whole slot, taller and wider than the bar. */}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.label}: ${formatValue(d.value)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                style={{ cursor: 'default', outline: 'none' }}
              />
              {i % labelEvery === 0 && (
                <Box component="text" x={pad.left + i * slot + slot / 2} y={height - 8} textAnchor="middle" sx={{ fontSize: 11, fill: 'text.secondary' }}>
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
            left: Math.min(Math.max(pad.left + active * slot + slot / 2, 70), width - 70),
            transform: 'translateX(-50%)',
            px: 1.25,
            py: 0.75,
            borderRadius: 1.5,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            boxShadow: 3,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {formatValue(hovered.value)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {hovered.label}
            {hovered.detail ? ` · ${hovered.detail}` : ''}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

/**
 * Ranked horizontal bars with the label and value written out (no legend needed, never colour alone).
 * rows: [{ key, label, value, caption }]
 */
export function BarList({ rows, formatValue = (v) => formatINR(v, { decimals: 0 }), empty = 'Nothing yet' }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max === 0) {
    return (
      <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
        {empty}
      </Typography>
    );
  }
  return (
    <Stack spacing={1.5}>
      {rows.map((r) => (
        <Box key={r.key} title={`${r.label}: ${formatValue(r.value)}${r.caption ? ` · ${r.caption}` : ''}`}>
          <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 500, minWidth: 0 }}>
              {r.label}
              {r.caption && (
                <Typography component="span" variant="caption" color="textSecondary">
                  {' '}
                  · {r.caption}
                </Typography>
              )}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {formatValue(r.value)}
            </Typography>
          </Stack>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
            <Box sx={(theme) => ({ ...barBg(theme), height: '100%', width: r.value > 0 ? `${Math.max(2, (r.value / max) * 100)}%` : 0, borderRadius: 4, transition: 'width 300ms ease' })} />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}
