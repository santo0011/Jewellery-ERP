import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Box, Breadcrumbs, ButtonBase, Link, Stack, Typography, useMediaQuery } from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { NAV_GROUPS, PROFILE_ITEM } from '../layouts/navConfig.js';
import { fonts, tokens } from '../theme/tokens.js';
import PhoneHero from './PhoneHero.jsx';
import { t } from '../i18n/index.js';

/**
 * Goes back one step when the user arrived from inside the app (keeps their search, tab and page),
 * otherwise (opened by link or refresh) to the parent list.
 */
function BackButton({ to, label }) {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(to));
  return (
    <ButtonBase
      onClick={goBack}
      aria-label={t('Back to {{label}}', { label })}
      sx={{
        mb: { xs: 1.25, sm: 1.5 },
        pl: 0.5,
        pr: 1.75,
        py: 0.5,
        gap: 1,
        borderRadius: 999,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.secondary',
        fontSize: '0.8125rem',
        fontWeight: 600,
        transition: 'color 160ms ease, border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
        '& .back-arrow': { transition: 'transform 160ms ease, background 160ms ease, color 160ms ease' },
        '&:hover': { color: tokens.brand.strong, borderColor: tokens.brand.main, bgcolor: 'rgba(var(--brand-rgb), 0.06)', boxShadow: '0 2px 10px rgba(var(--brand-rgb), 0.15)' },
        '&:hover .back-arrow': { transform: 'translateX(-2px)', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)' },
        '&:focus-visible': { outline: `2px solid ${tokens.brand.main}`, outlineOffset: 2 },
      }}
    >
      <Box className="back-arrow" sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(var(--brand-rgb), 0.12)', color: tokens.brand.strong }}>
        <ArrowBackRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
      <Box component="span" sx={{ maxWidth: { xs: '60vw', sm: 'none' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t('Back to {{label}}', { label })}
      </Box>
    </ButtonBase>
  );
}

/**
 * The menu entry of the page at this path and its group (the longest menu path it starts with, so a detail page takes
 * its list's). Pages outside the menu (the Super Admin panel) have none.
 */
function navMatchFor(pathname) {
  const entries = [...NAV_GROUPS.flatMap((g) => g.items.map((item) => ({ item, group: g.label }))), { item: PROFILE_ITEM, group: null }].filter((m) => m.item.path !== '/');
  return entries.filter((m) => pathname === m.item.path || pathname.startsWith(`${m.item.path}/`)).sort((a, b) => b.item.path.length - a.item.path.length)[0] ?? null;
}

// The page's buttons and fields on the dark phone card: light outlines and text so they show up there.
const ON_DARK = {
  '& .MuiButton-outlined': { color: '#F7F3E8', borderColor: 'rgba(247, 243, 232, 0.28)', bgcolor: 'rgba(247, 243, 232, 0.04)' },
  '& .MuiButton-text': { color: 'var(--brand-light)' },
  '& .MuiButton-containedSecondary': { color: '#F7F3E8', bgcolor: 'rgba(247, 243, 232, 0.12)', boxShadow: 'none' },
  '& .MuiButton-containedPrimary': { boxShadow: '0 8px 20px -8px rgba(var(--brand-rgb), 0.7)' },
  '& > .MuiIconButton-root': { color: '#F7F3E8' },
  '& .MuiOutlinedInput-root': { bgcolor: 'background.paper' },
  '& .MuiInputLabel-root:not(.Mui-focused)': { color: 'rgba(247, 243, 232, 0.8)' },
  '& .MuiToggleButton-root:not(.Mui-selected)': { color: 'rgba(247, 243, 232, 0.8)', borderColor: 'rgba(247, 243, 232, 0.2)' },
};
const LIGHT_MUTED = 'rgba(247, 243, 232, 0.6)';

/**
 * `back={{ to, label }}` shows a back button for detail pages (it replaces the breadcrumbs there).
 * Phones get the header as a dark card (PhoneHero) with the actions inside; `icon`, `avatar` (initials in place of
 * the icon), `phoneTitle` and `phoneSubtitle` override the menu icon, title and subtitle there.
 */
export default function PageHeader({ title, subtitle, breadcrumbs, actions, back, icon, avatar, phoneTitle, phoneSubtitle }) {
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const { pathname } = useLocation();
  const nav = navMatchFor(pathname);
  if (phone) {
    return (
      <>
        {back && <BackButton to={back.to} label={back.label} />}
        <PhoneHero compact icon={icon ?? nav?.item.icon ?? null} avatar={avatar} title={phoneTitle ?? title} subtitle={phoneSubtitle ?? subtitle}>
          {actions && (
            <Stack
              direction="row"
              sx={{
                flexWrap: 'wrap',
                gap: 1,
                '& > .MuiButton-root, & > .MuiStack-root > .MuiButton-root': { flex: '1 1 auto', borderRadius: 999, minHeight: 36, py: 0.5, fontSize: '0.8125rem' },
                '& > .MuiStack-root': { flexWrap: 'wrap', gap: 1, flex: '1 1 100%', '& > :not(style) ~ :not(style)': { ml: 0 } },
                ...ON_DARK,
              }}
            >
              {actions}
            </Stack>
          )}
        </PhoneHero>
      </>
    );
  }
  const EyebrowIcon = icon ?? nav?.item.icon;
  return (
    <>
      {back && <BackButton to={back.to} label={back.label} />}
      {/* The title on the dark, gold-lit band of the side menu; actions on the right (below it when there is no room). */}
      <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2.5, mb: 2.5, px: 3, py: 2, background: `${tokens.sidebar.glow}, ${tokens.sidebar.surface}`, color: '#F7F3E8', boxShadow: '0 18px 40px -24px rgba(0, 0, 0, 0.55)' }}>
        <Box aria-hidden sx={{ position: 'absolute', width: 260, height: 260, right: -70, top: -110, borderRadius: '50%', border: '1px solid rgba(var(--brand-rgb), 0.22)' }} />
        <Box aria-hidden sx={{ position: 'absolute', width: 180, height: 180, right: 40, top: -40, borderRadius: '50%', border: '1px solid rgba(var(--brand-rgb), 0.14)' }} />
        <Stack direction="row" sx={{ position: 'relative', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ minWidth: 0, flex: '1 1 300px' }}>
            {/* Top line: the breadcrumbs when the page has them, otherwise the menu section and its icon. */}
            {!back && breadcrumbs ? (
              <Breadcrumbs sx={{ fontSize: '0.75rem', color: LIGHT_MUTED, '& .MuiBreadcrumbs-separator': { color: LIGHT_MUTED } }}>
                {breadcrumbs.map((b) =>
                  b.to ? (
                    <Link key={b.label} component={RouterLink} to={b.to} underline="hover" sx={{ color: 'var(--brand-light)', fontWeight: 600 }}>
                      {b.label}
                    </Link>
                  ) : (
                    <Typography key={b.label} sx={{ fontSize: 'inherit', color: LIGHT_MUTED }}>
                      {b.label}
                    </Typography>
                  ),
                )}
              </Breadcrumbs>
            ) : (
              (nav?.group || EyebrowIcon) && (
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'var(--brand-light)' }}>
                  {EyebrowIcon && <EyebrowIcon sx={{ fontSize: 15 }} />}
                  {nav?.group && (
                    <Typography noWrap sx={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                      {nav.group}
                    </Typography>
                  )}
                </Stack>
              )
            )}
            <Typography component="h1" sx={{ fontFamily: fonts.display, fontSize: { sm: 28, md: 32 }, fontWeight: 600, lineHeight: 1.1, mt: 0.25 }}>
              {title}
            </Typography>
            {subtitle && (
              // Grey text a page puts in its subtitle takes the banner's light colour; links show in gold.
              <Typography component="div" variant="body2" sx={{ mt: 0.25, color: LIGHT_MUTED, '& .MuiTypography-root': { color: 'inherit' }, '& a': { color: 'var(--brand-light)' } }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && (
            <Stack direction="row" sx={{ flexShrink: 0, flexWrap: 'wrap', gap: 1, alignItems: 'center', '& > .MuiStack-root': { flexWrap: 'wrap', gap: 1, '& > :not(style) ~ :not(style)': { ml: 0 } }, ...ON_DARK }}>
              {actions}
            </Stack>
          )}
        </Stack>
      </Box>
    </>
  );
}
