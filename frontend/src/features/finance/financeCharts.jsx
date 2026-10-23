import { Box, Stack, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { compactINR, niceMax, useWidth } from '../home/charts.jsx';
import { seriesSx } from '../home/shareCharts.jsx';

// A loss bar: the theme's error colour (a CSS variable, since SVG fill does not take palette names).
const LOSS = 'var(--mui-palette-error-main)';
const inr = (p) => formatINR(p, { decimals: 0 });
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const AXIS = { fontSize: 11, fill: 'var(--mui-palette-text-secondary)', fontVariantNumeric: 'tabular-nums' };

// Sales and expenses: the first two categorical slots (blue, orange), validated light and dark; never cycled.
const SERIES = [
  { key: 'salesPaise', label: 'Sales', slot: 0 },
  { key: 'expensesPaise', label: 'Expenses', slot: 1 },
];

/** Legend: swatch, name and the period total for each line (identity is never colour alone). */
function LineLegend({ totals }) {
  return (
    <Stack direction="row" sx={{ gap: { xs: 2, sm: 3 }, flexWrap: 'wrap', mb: 1.5 }}>
      {SERIES.map((s) => (
        <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={(theme) => ({ width: 14, height: 3, borderRadius: 2, ...seriesSx(s.slot, 'bgcolor')(theme) })} />
          <Typography variant="body2" color="textSecondary">
            {s.label}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {inr(totals[s.key])}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Every day of the month: sales and expenses as two lines on one money axis. Days still to come are left empty.
 * Hover (or tap) for the day's figures. days: [{ date, future, salesPaise, expensesPaise }]
 */
export function SalesExpenseChart({ days, height = 260 }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const pad = { top: 12, right: 12, bottom: 26, left: 52 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const shown = days.filter((d) => !d.future);
  const max = niceMax(Math.max(0, ...shown.flatMap((d) => [d.salesPaise, d.expensesPaise])));
  const step = days.length > 1 ? innerW / (days.length - 1) : 0;
  const x = (i) => pad.left + i * step;
  const y = (v) => pad.top + innerH - (v / max) * innerH;
  const empty = shown.every((d) => !d.salesPaise && !d.expensesPaise);
  const ticks = empty ? [0] : [0, max / 2, max];
  const labelEvery = Math.ceil(days.length / Math.max(1, Math.floor(innerW / 56)));
  const path = (key) => shown.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d[key])}`).join(' ');
  const totals = { salesPaise: shown.reduce((n, d) => n + d.salesPaise, 0), expensesPaise: shown.reduce((n, d) => n + d.expensesPaise, 0) };
  const hovered = active != null && active < shown.length ? shown[active] : null;

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - box.left - pad.left) / (step || 1));
    setActive(Math.max(0, Math.min(shown.length - 1, i)));
  };

  return (
    <Box>
      <LineLegend totals={totals} />
      <Box ref={ref} sx={{ position: 'relative', width: '100%' }} onMouseLeave={() => setActive(null)}>
        <Box component="svg" width={width} height={height} role="img" aria-label="Daily sales and expenses" onMouseMove={onMove} onTouchStart={(e) => onMove(e.touches[0] ? { ...e, clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)} sx={{ display: 'block', overflow: 'visible', touchAction: 'pan-y' }}>
          {ticks.map((t) => (
            <g key={t}>
              <Box component="line" x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} sx={{ stroke: t === 0 ? 'var(--mui-palette-text-disabled)' : 'var(--mui-palette-divider)', strokeWidth: 1 }} />
              <Box component="text" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" sx={AXIS}>
                {compactINR(t)}
              </Box>
            </g>
          ))}
          {!empty &&
            SERIES.map((s) => (
              <Box key={s.key} component="path" d={path(s.key)} sx={(theme) => ({ fill: 'none', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', ...seriesSx(s.slot, 'stroke')(theme) })} />
            ))}
          {days.map((d, i) =>
            i % labelEvery === 0 ? (
              <Box key={d.date} component="text" x={x(i)} y={height - 8} textAnchor="middle" sx={{ ...AXIS, opacity: d.future ? 0.5 : 1 }}>
                {Number(d.date.slice(8))}
              </Box>
            ) : null,
          )}
          {hovered && !empty && (
            <g>
              <Box component="line" x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} sx={{ stroke: 'var(--mui-palette-text-disabled)', strokeWidth: 1, strokeDasharray: '3 3' }} />
              {SERIES.map((s) => (
                <Box key={s.key} component="circle" cx={x(active)} cy={y(hovered[s.key])} r={4.5} sx={(theme) => ({ stroke: theme.palette.background.paper, strokeWidth: 2, ...seriesSx(s.slot, 'fill')(theme) })} />
              ))}
            </g>
          )}
        </Box>
        {empty && (
          <Typography variant="body2" color="textSecondary" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
            No sales or expenses yet this month
          </Typography>
        )}
        {hovered && !empty && (
          <Box sx={{ position: 'absolute', top: 0, left: Math.min(Math.max(x(active), 90), width - 90), transform: 'translateX(-50%)', px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: 'background.paper', border: 1, borderColor: 'divider', boxShadow: 3, pointerEvents: 'none', whiteSpace: 'nowrap', minWidth: 150 }}>
            <Typography variant="caption" color="textSecondary">
              {dayLabel(hovered.date)}
            </Typography>
            {SERIES.map((s) => (
              <Stack key={s.key} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={(theme) => ({ width: 8, height: 8, borderRadius: '50%', ...seriesSx(s.slot, 'bgcolor')(theme) })} />
                  <Typography variant="caption">{s.label}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {inr(hovered[s.key])}
                </Typography>
              </Stack>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/**
 * Net profit for each of the last months, one bar each: gold above the line for profit, red below it for a loss.
 * months: [{ month, netProfitPaise, salesPaise, expensesPaise }]
 */
export function MonthlyProfitBars({ months, height = 220 }) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState(null);
  const pad = { top: 22, right: 8, bottom: 26, left: 8 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const hi = Math.max(0, ...months.map((m) => m.netProfitPaise));
  const lo = Math.min(0, ...months.map((m) => m.netProfitPaise));
  const span = niceMax(hi - lo || 1);
  const scale = innerH / span;
  const zero = pad.top + hi * scale + Math.max(0, (innerH - (hi - lo) * scale) / 2);
  const slot = months.length ? innerW / months.length : 0;
  const barW = Math.min(44, slot * 0.56);
  const hovered = active != null ? months[active] : null;

  return (
    <Box ref={ref} sx={{ position: 'relative', width: '100%' }} onMouseLeave={() => setActive(null)}>
      <Box component="svg" width={width} height={height} role="img" aria-label="Net profit by month" sx={{ display: 'block', overflow: 'visible' }}>
        <Box component="line" x1={pad.left} x2={width - pad.right} y1={zero} y2={zero} sx={{ stroke: 'var(--mui-palette-text-disabled)', strokeWidth: 1 }} />
        {months.map((m, i) => {
          const v = m.netProfitPaise;
          const h = Math.max(v ? 2 : 0, Math.abs(v) * scale);
          const cx = pad.left + slot * i + slot / 2;
          const top = v >= 0 ? zero - h : zero;
          return (
            <g key={m.month} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)} style={{ cursor: 'default' }}>
              {/* Hit target wider than the bar. */}
              <rect x={pad.left + slot * i} y={pad.top} width={slot} height={innerH} fill="transparent" />
              <Box
                component="rect"
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={4}
                sx={(theme) => ({ fill: v >= 0 ? 'var(--brand-strong)' : LOSS, opacity: active == null || active === i ? 1 : 0.55, transition: 'opacity 150ms', ...theme.applyStyles('dark', { fill: v >= 0 ? 'var(--brand-mark)' : LOSS }) })}
              />
              <Box component="text" x={cx} y={v >= 0 ? top - 6 : top + h + 13} textAnchor="middle" sx={{ ...AXIS, fontWeight: 700, fill: 'var(--mui-palette-text-primary)' }}>
                {v ? `${v < 0 ? '−' : ''}${compactINR(Math.abs(v))}` : '0'}
              </Box>
              <Box component="text" x={cx} y={height - 8} textAnchor="middle" sx={AXIS}>
                {monthLabel(m.month)}
              </Box>
            </g>
          );
        })}
      </Box>
      {hovered && (
        <Box sx={{ position: 'absolute', top: 0, left: Math.min(Math.max(pad.left + slot * active + slot / 2, 90), width - 90), transform: 'translateX(-50%)', px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: 'background.paper', border: 1, borderColor: 'divider', boxShadow: 3, pointerEvents: 'none', whiteSpace: 'nowrap', minWidth: 160 }}>
          <Typography variant="caption" color="textSecondary">
            {new Date(`${hovered.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </Typography>
          {[
            ['Sales', hovered.salesPaise],
            ['Gross profit', hovered.grossProfitPaise],
            ['Expenses', hovered.expensesPaise],
            ['Net profit', hovered.netProfitPaise],
          ].map(([k, v]) => (
            <Stack key={k} direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
              <Typography variant="caption">{k}</Typography>
              <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: k === 'Net profit' ? (v < 0 ? 'error.main' : 'success.main') : 'text.primary' }}>
                {inr(v)}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
    </Box>
  );
}
