import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import { Box, Typography } from '@mui/material';
import { tokens } from '../../theme/tokens.js';

export const PAYROLL_STEPS = [
  { key: 'calculate', label: 'Calculate', hint: 'Salary from attendance', icon: CalculateOutlinedIcon },
  { key: 'review', label: 'Review', hint: 'Bonus & deductions', icon: FactCheckOutlinedIcon },
  { key: 'finalise', label: 'Finalise', hint: 'Lock & book in accounts', icon: TaskAltRoundedIcon },
  { key: 'pay', label: 'Pay', hint: 'Cash, bank or UPI', icon: PaymentsOutlinedIcon },
];

/** Index of the step a run is on: 1 = reviewing a draft, 3 = paying, 4 = all done. No run yet = 0. */
export const stepOf = (status) => ({ draft: 1, finalised: 3, paid: 4 })[status] ?? 0;

const gold = tokens.sidebar.goldGradient;

/** Horizontal progress: done steps get a gold tick, the current one a gold ring, later ones stay grey. current = -1 shows a neutral guide. */
export default function PayrollSteps({ current = 0, compact = false }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, rowGap: 2 }}>
      {PAYROLL_STEPS.map((step, i) => {
        const done = i < current;
        const guide = current < 0;
        const active = guide || i === current;
        const Icon = done ? CheckRoundedIcon : step.icon;
        return (
          <Box key={step.key} sx={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 1.25, pr: 1 }}>
            {i < PAYROLL_STEPS.length - 1 && (
              <Box
                aria-hidden
                sx={{ display: { xs: 'none', sm: 'block' }, position: 'absolute', left: compact ? 40 : 46, right: 8, top: '50%', height: 2, borderRadius: 1, background: done ? gold : 'none', bgcolor: done ? undefined : 'divider', zIndex: 0 }}
              />
            )}
            <Box
              sx={{
                position: 'relative',
                zIndex: 1,
                width: compact ? 32 : 38,
                height: compact ? 32 : 38,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                background: done ? gold : undefined,
                bgcolor: done ? undefined : 'background.paper',
                color: done ? '#171717' : active ? tokens.light.goldDark : 'text.disabled',
                border: done ? 'none' : `2px solid`,
                borderColor: active ? tokens.light.gold : 'divider',
                boxShadow: active && !guide ? '0 0 0 4px rgba(201, 162, 39, 0.15)' : done ? '0 3px 10px rgba(201, 162, 39, 0.3)' : 'none',
              }}
            >
              <Icon sx={{ fontSize: compact ? 16 : 19 }} />
            </Box>
            <Box sx={{ position: 'relative', zIndex: 1, minWidth: 0, bgcolor: 'background.paper', pr: 1 }}>
              <Typography sx={{ fontSize: compact ? '0.8125rem' : '0.875rem', fontWeight: 700, lineHeight: 1.2, color: done || active ? 'text.primary' : 'text.secondary' }}>
                {i + 1}. {step.label}
              </Typography>
              {!compact && (
                <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  {step.hint}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
