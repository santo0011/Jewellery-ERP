import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { IconButton, Tooltip } from '@mui/material';

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

/** A trailing table column holding just the View button. */
export const viewColumn = (onView, { title, name } = {}) => ({
  key: 'actions',
  label: '',
  align: 'right',
  width: 56,
  render: (row) => <ViewButton onClick={() => onView(row)} title={title} name={name?.(row)} />,
});
