import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { IconButton, Tooltip } from '@mui/material';
import { t } from '../i18n/index.js';

/** A Delete button that cannot be used, with the reason on hover — every table keeps the same set of buttons. */
export default function DisabledDelete({ reason, size = 'small' }) {
  return (
    <Tooltip title={reason}>
      <span>
        <IconButton size={size} disabled aria-label={t('Cannot delete: {{reason}}', { reason })}>
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </span>
    </Tooltip>
  );
}
