import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { Box, ButtonBase, Card, Typography } from '@mui/material';
import { MONEY_TONE } from './Amount.jsx';

/**
 * Accent per tone: `line` is the top rule and icon tile, `tint` washes the card, `fg` is the icon colour.
 * Numbers stay in normal ink unless `valueTone` says they mean paid / due.
 */
const TONE = {
  gold: { fg: '#9C7A16', line: 'linear-gradient(90deg, #E9CF6E, #C9A227 55%, #A8841B)', tint: 'rgba(201, 162, 39, 0.10)' },
  blue: { fg: '#2F5D7C', line: 'linear-gradient(90deg, #7FA8C9, #2F5D7C)', tint: 'rgba(47, 93, 124, 0.09)' },
  green: { fg: MONEY_TONE.paid, line: 'linear-gradient(90deg, #6FBF98, #2E6B4F)', tint: 'rgba(46, 107, 79, 0.09)' },
  red: { fg: MONEY_TONE.due, line: 'linear-gradient(90deg, #E39090, #9B2C2C)', tint: 'rgba(155, 44, 44, 0.08)' },
  amber: { fg: '#B7791F', line: 'linear-gradient(90deg, #F2C374, #B7791F)', tint: 'rgba(183, 121, 31, 0.10)' },
  grey: { fg: '#6B6760', line: 'linear-gradient(90deg, #C9C4B8, #8C877C)', tint: 'rgba(107, 103, 96, 0.07)' },
};
const VALUE_TONE = { paid: MONEY_TONE.paid, due: MONEY_TONE.due };

/**
 * One headline number: small label and icon on top, the big number, a short caption.
 * `valueTone`: 'paid' | 'due' colours the number; `onClick` turns the card into a shortcut (it lifts and shows an arrow).
 */
export function SummaryCard({ icon: Icon, label, value, caption, tone = 'gold', valueTone, onClick }) {
  const t = TONE[tone] ?? TONE.gold;
  const body = (
    <Box sx={{ position: 'relative', width: '100%', height: '100%', px: 2, pt: 1.5, pb: 1.25, textAlign: 'left', overflow: 'hidden' }}>
      {/* Large faint icon in the corner — decoration only. */}
      {Icon && <Icon aria-hidden sx={{ position: 'absolute', right: -12, bottom: -16, fontSize: 76, color: t.fg, opacity: 0.07, pointerEvents: 'none' }} />}

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.5 }}>
        <Typography noWrap sx={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', minWidth: 0 }}>
          {label}
        </Typography>
        {Icon && (
          <Box sx={{ width: 28, height: 28, borderRadius: 1.5, flexShrink: 0, display: 'grid', placeItems: 'center', background: t.line, color: '#fff', boxShadow: '0 4px 12px rgba(23, 23, 23, 0.12)' }}>
            <Icon sx={{ fontSize: 16 }} />
          </Box>
        )}
      </Box>

      <Typography sx={{ position: 'relative', fontSize: { xs: '1.35rem', md: '1.45rem' }, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.01em', whiteSpace: 'nowrap', color: VALUE_TONE[valueTone] ?? 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>

      {(caption || onClick) && (
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25, minHeight: 18 }}>
          {caption && (
            <>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, bgcolor: t.fg, opacity: 0.8 }} />
              <Typography variant="caption" color="textSecondary" noWrap sx={{ minWidth: 0 }}>
                {caption}
              </Typography>
            </>
          )}
          {onClick && <ArrowForwardRoundedIcon className="card-arrow" sx={{ ml: 'auto', fontSize: 16, color: t.fg, opacity: 0, transform: 'translateX(-4px)', transition: 'opacity 160ms, transform 160ms' }} />}
        </Box>
      )}
    </Box>
  );

  return (
    <Card
      sx={{
        position: 'relative',
        height: '100%',
        overflow: 'hidden',
        background: (theme) => `linear-gradient(160deg, ${t.tint} 0%, transparent 55%), ${theme.vars.palette.background.paper}`,
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        '&::before': { content: '""', position: 'absolute', inset: '0 0 auto 0', height: 3, background: t.line },
        ...(onClick && {
          '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 10px 24px rgba(23, 23, 23, 0.10)', borderColor: t.fg },
          '&:hover .card-arrow': { opacity: 1, transform: 'translateX(0)' },
        }),
      }}
    >
      {onClick ? (
        <ButtonBase onClick={onClick} sx={{ display: 'block', width: '100%', height: '100%', borderRadius: 'inherit', '&:focus-visible': { outline: `2px solid ${t.fg}`, outlineOffset: -2 } }}>
          {body}
        </ButtonBase>
      ) : (
        body
      )}
    </Card>
  );
}

/** The row of cards above a list: 1 per row on phones, 2 on tablets, 3 on small laptops, all in one row (up to 5) on desktop. */
export default function SummaryCards({ children }) {
  const count = [children].flat().filter(Boolean).length;
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: `repeat(${Math.min(Math.max(count, 1), 3)}, 1fr)`, lg: `repeat(${Math.min(Math.max(count, 1), 5)}, 1fr)` }, gap: 2, mb: 2.5 }}>{children}</Box>;
}
