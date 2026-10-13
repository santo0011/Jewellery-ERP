import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { IconButton, Stack, Tooltip } from '@mui/material';
import DisabledDelete from './DisabledDelete.jsx';

/** The one way into a record's details from a table: rows themselves are not clickable. */
export default function ViewButton({ onClick, title = 'View details', name, icon: Icon = VisibilityOutlinedIcon }) {
  return (
    <Tooltip title={title}>
      <IconButton size="small" onClick={onClick} aria-label={name ? `${title}: ${name}` : title}>
        <Icon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/**
 * A trailing table column with the View button. `deleteDisabled` (a reason) adds a disabled Delete beside it, for
 * records that are never deleted — so every table shows the same buttons.
 */
export const viewColumn = (onView, { title, name, deleteDisabled } = {}) => ({
  key: 'actions',
  label: 'Action',
  align: 'right',
  width: deleteDisabled ? 96 : 80,
  render: (row) =>
    deleteDisabled ? (
      <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
        <ViewButton onClick={() => onView(row)} title={title} name={name?.(row)} />
        <DisabledDelete reason={typeof deleteDisabled === 'function' ? deleteDisabled(row) : deleteDisabled} />
      </Stack>
    ) : (
      <ViewButton onClick={() => onView(row)} title={title} name={name?.(row)} />
    ),
});
