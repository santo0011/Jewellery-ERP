import { createTheme } from '@mui/material/styles';
import { fonts, tokens } from './tokens.js';

const palette = (t) => ({
  primary: { main: t.gold, dark: t.goldDark, contrastText: '#171717' },
  secondary: { main: t.ink, contrastText: t.cream },
  success: { main: t.success },
  warning: { main: t.warning },
  error: { main: t.danger },
  info: { main: t.info },
  background: { default: t.cream, paper: t.paper },
  text: { primary: t.ink, secondary: t.muted },
  divider: t.border,
  soft: { main: t.soft },
  gold: { main: t.gold, dark: t.goldDark },
  accent: { main: t.goldDark, contrastText: t.paper },
});

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: { palette: palette(tokens.light) },
    dark: { palette: palette(tokens.dark) },
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: fonts.body,
    fontSize: 14,
    h1: { fontSize: '2rem', fontWeight: 600, letterSpacing: '-0.01em' },
    h2: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.01em' },
    h3: { fontSize: '1.25rem', fontWeight: 600 },
    h4: { fontSize: '1.125rem', fontWeight: 600 },
    h5: { fontSize: '1rem', fontWeight: 600 },
    h6: { fontSize: '0.875rem', fontWeight: 600 },
    subtitle2: { fontSize: '0.8125rem', fontWeight: 500 },
    body2: { fontSize: '0.8125rem' },
    overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontFeatureSettings: '"tnum" 1', WebkitFontSmoothing: 'antialiased' },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 6, paddingInline: 16, minHeight: 40 } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: { outlined: ({ theme }) => ({ borderColor: theme.vars.palette.divider }) },
    },
    // Papers default to elevation 0, so give the dropdown its own border and shadow - otherwise it blends into the
    // content underneath and looks like it is behind it.
    MuiAutocomplete: {
      styleOverrides: {
        paper: ({ theme }) => ({ marginTop: 4, border: `1px solid ${theme.vars.palette.divider}`, borderRadius: 8, boxShadow: theme.vars.shadows[8] }),
        listbox: { paddingBlock: 4 },
      },
    },
    MuiCard: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: 12 } },
    },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({ backgroundColor: theme.vars.palette.background.paper }),
        inputSizeSmall: { paddingTop: 10.5, paddingBottom: 10.5 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: ({ theme }) => ({
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
          paddingTop: 12,
          paddingBottom: 12,
          color: tokens.table.headText,
          background: tokens.table.headFill,
          borderBottom: `1px solid ${tokens.table.headRule}`,
          ...theme.applyStyles('dark', { color: tokens.table.headTextDark, background: tokens.table.headFillDark }),
        }),
        body: { transition: 'background-color 140ms ease, box-shadow 140ms ease' },
        root: { borderColor: tokens.table.rowRule },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme }) => ({
          '.MuiTableBody-root &:nth-of-type(even) > td': { backgroundColor: tokens.table.stripe, ...theme.applyStyles('dark', { backgroundColor: tokens.table.stripeDark }) },
          '&.MuiTableRow-hover:hover > td': { backgroundColor: tokens.table.hover },
          '&.MuiTableRow-hover:hover > td:first-of-type': { boxShadow: `inset 3px 0 0 ${tokens.light.gold}` },
        }),
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: ({ theme }) => ({ color: theme.vars.palette.text.secondary }),
        selectLabel: { fontSize: '0.75rem', letterSpacing: '0.02em' },
        displayedRows: ({ theme }) => ({ fontSize: '0.8125rem', fontWeight: 500, color: theme.vars.palette.text.primary }),
        actions: ({ theme }) => ({
          '& .MuiIconButton-root': { borderRadius: 8, border: `1px solid ${theme.vars.palette.divider}`, marginLeft: 6, width: 32, height: 32 },
          '& .MuiIconButton-root:not(.Mui-disabled):hover': { borderColor: tokens.light.gold, color: tokens.light.goldDark, backgroundColor: tokens.table.hover },
        }),
      },
    },
    MuiChip: { styleOverrides: { root: { borderRadius: 6, fontWeight: 500 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});
