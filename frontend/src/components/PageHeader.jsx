import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import { Box, Breadcrumbs, ButtonBase, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { tokens } from '../theme/tokens.js';

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
      aria-label={`Back to ${label}`}
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
        Back to {label}
      </Box>
    </ButtonBase>
  );
}

/** `back={{ to, label }}` shows a back button for detail pages (it replaces the breadcrumbs there). */
export default function PageHeader({ title, subtitle, breadcrumbs, actions, back }) {
  return (
    // Title and actions share a row when there is room; otherwise the actions wrap below (never squeezing the title).
    <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ mb: { xs: 2, sm: 3 }, gap: { xs: 1.5, sm: 2 }, flexWrap: { sm: 'wrap' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
      <Box sx={{ minWidth: 0, flex: { sm: '1 1 300px' } }}>
        {back ? (
          <BackButton to={back.to} label={back.label} />
        ) : (
          breadcrumbs && (
            <Breadcrumbs sx={{ mb: 0.5, fontSize: '0.75rem' }}>
              {breadcrumbs.map((b) =>
                b.to ? (
                  <Link key={b.label} component={RouterLink} to={b.to} underline="hover" color="textSecondary">
                    {b.label}
                  </Link>
                ) : (
                  <Typography key={b.label} sx={{ fontSize: 'inherit' }} color="textSecondary">
                    {b.label}
                  </Typography>
                ),
              )}
            </Breadcrumbs>
          )
        )}
        <Typography variant="h2" component="h1">
          {title}
        </Typography>
        {subtitle && (
          <Typography component="div" variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {/* On a phone the actions wrap and share the width, so each is an easy tap. */}
      {actions && (
        <Stack
          direction="row"
          sx={{
            flexShrink: 0,
            flexWrap: 'wrap',
            gap: 1,
            justifyContent: { xs: 'stretch', sm: 'flex-end' },
            '& > .MuiButton-root, & > .MuiStack-root > .MuiButton-root': { flex: { xs: '1 1 auto', sm: '0 0 auto' } },
            '& > .MuiStack-root': { flexWrap: 'wrap', gap: 1, flex: { xs: '1 1 100%', sm: '0 0 auto' }, '& > :not(style) ~ :not(style)': { ml: 0 } },
          }}
        >
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
