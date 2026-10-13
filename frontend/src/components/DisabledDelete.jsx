import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { IconButton, Tooltip } from '@mui/material';

/** A Delete button that cannot be used, with the reason on hover — every table keeps the same set of buttons. */
export default function DisabledDelete({ reason, size = 'small' }) {
  return (
    <Tooltip title={reason}>
      <span>
        <IconButton size={size} disabled aria-label={`Cannot delete: ${reason}`}>
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
