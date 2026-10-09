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
        mb: 1.5,
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
        '&:hover': { color: tokens.light.goldDark, borderColor: tokens.light.gold, bgcolor: 'rgba(201, 162, 39, 0.06)', boxShadow: '0 2px 10px rgba(201, 162, 39, 0.15)' },
        '&:hover .back-arrow': { transform: 'translateX(-2px)', background: tokens.sidebar.goldGradient, color: '#171717' },
        '&:focus-visible': { outline: `2px solid ${tokens.light.gold}`, outlineOffset: 2 },
      }}
    >
      <Box className="back-arrow" sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(201, 162, 39, 0.12)', color: tokens.light.goldDark }}>
        <ArrowBackRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
      Back to {label}
    </ButtonBase>
  );
}

/** `back={{ to, label }}` shows a back button for detail pages (it replaces the breadcrumbs there). */
export default function PageHeader({ title, subtitle, breadcrumbs, actions, back }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
      <Box sx={{ minWidth: 0 }}>
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
      {actions && <Stack direction="row" spacing={1} sx={{ flexShrink: 0, justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>{actions}</Stack>}
    </Stack>
  );
}
