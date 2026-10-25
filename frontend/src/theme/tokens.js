/**
 * Brand colours as CSS variables. Their defaults (the gold theme) are declared in theme/index.js (CssBaseline);
 * the Organisation Panel overrides them with a palette made from the organisation's logo (useBrandTheme), so
 * everything that uses these follows the logo. Components use these, never the hex values below.
 */
export const BRAND_DEFAULTS = {
  '--brand': '#C9A227',
  '--brand-rgb': '201, 162, 39',
  '--brand-strong': '#9C7A16', // text and icons on light surfaces (>= 4.5:1)
  '--brand-strong-rgb': '156, 122, 22',
  '--brand-light': '#E9CF6E',
  '--brand-deep': '#A8841B',
  '--brand-contrast': '#171717', // text on brand fills
  '--brand-mark': '#9C7A16', // chart marks
  '--sidebar-bg': '#171717',
  '--sidebar-surface': 'linear-gradient(180deg, #1C1B18 0%, #141412 55%, #0F0F0E 100%)',
  '--sidebar-text': '#D9D4C7',
  '--sidebar-muted': '#8C877C',
  '--table-head-fill': 'linear-gradient(180deg, #FBF8EF 0%, #F4EEDC 100%)',
  '--table-head-text': '#7A6A3E',
};
export const BRAND_DEFAULTS_DARK = {
  '--brand-mark': '#B38D1E',
  '--table-head-fill': 'linear-gradient(180deg, #2B2925 0%, #24221F 100%)',
  '--table-head-text': '#CBB873',
};

const v = (name) => `var(${name})`;

export const tokens = {
  brand: {
    main: v('--brand'),
    strong: v('--brand-strong'),
    light: v('--brand-light'),
    deep: v('--brand-deep'),
    contrast: v('--brand-contrast'),
    mark: v('--brand-mark'),
    gradient: 'linear-gradient(135deg, var(--brand-light) 0%, var(--brand) 50%, var(--brand-deep) 100%)',
  },
  light: {
    ink: '#171717',
    gold: '#C9A227',
    goldDark: '#9C7A16',
    cream: '#F7F3E8',
    paper: '#FFFFFF',
    soft: '#F4F4F2',
    border: '#E6E1D3',
    muted: '#6B6760',
    success: '#2E6B4F',
    warning: '#B7791F',
    danger: '#9B2C2C',
    info: '#2F5D7C',
  },
  dark: {
    ink: '#F7F3E8',
    gold: '#D4B13F',
    goldDark: '#C9A227',
    cream: '#1F1E1B',
    paper: '#232220',
    soft: '#2A2926',
    border: '#3A3833',
    muted: '#A8A398',
    success: '#5FA884',
    warning: '#E0A84A',
    danger: '#E07070',
    info: '#7FA8C9',
  },
  sidebar: {
    background: v('--sidebar-bg'),
    backgroundDark: v('--sidebar-bg'),
    text: v('--sidebar-text'),
    muted: v('--sidebar-muted'),
    hover: 'rgba(var(--brand-rgb), 0.08)',
    active: v('--brand'),
    divider: 'rgba(255, 255, 255, 0.08)',
    surface: v('--sidebar-surface'),
    glow: 'radial-gradient(120% 60% at 0% 0%, rgba(var(--brand-rgb), 0.16) 0%, rgba(var(--brand-rgb), 0) 60%)',
    edge: 'linear-gradient(180deg, rgba(var(--brand-rgb), 0) 0%, rgba(var(--brand-rgb), 0.35) 30%, rgba(var(--brand-rgb), 0.12) 100%)',
    goldGradient: 'linear-gradient(135deg, var(--brand-light) 0%, var(--brand) 50%, var(--brand-deep) 100%)',
    activeFill: 'linear-gradient(90deg, rgba(var(--brand-rgb), 0.16) 0%, rgba(var(--brand-rgb), 0.03) 100%)',
    tile: 'rgba(255, 255, 255, 0.04)',
  },
  // Shared by every table (MuiTableCell / MuiTableRow overrides in theme/index.js).
  table: {
    headFill: v('--table-head-fill'),
    headFillDark: v('--table-head-fill'),
    headText: v('--table-head-text'),
    headTextDark: v('--table-head-text'),
    headRule: 'rgba(var(--brand-rgb), 0.35)',
    rowRule: 'rgba(120, 104, 60, 0.12)',
    stripe: 'rgba(var(--brand-rgb), 0.025)',
    stripeDark: 'rgba(255, 255, 255, 0.015)',
    hover: 'rgba(var(--brand-rgb), 0.07)',
  },
};

export const fonts = {
  // Bengali and Hindi letters come from Noto (loaded only for those languages, see i18n/index.js).
  body: '"Inter Variable", Inter, "Noto Sans Bengali Variable", "Noto Sans Devanagari Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  display: '"Cormorant Garamond", "Noto Sans Bengali Variable", "Noto Sans Devanagari Variable", Georgia, "Times New Roman", serif',
};
