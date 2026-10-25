import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded';
import { Button } from '@mui/material';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { getErrorMessage } from '../utils/errors.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import { t } from '../i18n/index.js';

/** Detail-page actions. Edit and Delete live in the list's Action column, so pages usually pass only onStatus. */
export default function RecordActions({ name, status, canEdit, canDelete, onEdit, onStatus, onDelete, deleteMessage }) {
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (confirm === 'delete') await onDelete();
      else await onStatus(status === 'active' ? 'inactive' : 'active');
      setConfirm(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {canEdit && onEdit && (
        <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={onEdit}>
          {t('Edit')}
        </Button>
      )}
      {canEdit && onStatus && (
        <Button variant="outlined" color="secondary" startIcon={<PowerSettingsNewRoundedIcon />} onClick={() => setConfirm('status')}>
          {status === 'active' ? t('Deactivate') : t('Activate')}
        </Button>
      )}
      {canDelete && onDelete && (
        <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setConfirm('delete')}>
          {t('Delete')}
        </Button>
      )}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'delete' ? t('Delete {{name}}?', { name }) : status === 'active' ? t('Deactivate {{name}}?', { name }) : t('Activate {{name}}?', { name })}
        message={
          confirm === 'delete'
            ? (deleteMessage ?? t('This record will be removed from lists. Its history is kept in the audit log.'))
            : status === 'active'
              ? t('Inactive records stay in history but are hidden from new transactions.')
              : t('The record will be available for new transactions again.')
        }
        confirmLabel={confirm === 'delete' ? t('Delete') : status === 'active' ? t('Deactivate') : t('Activate')}
        danger={confirm === 'delete' || status === 'active'}
        loading={busy}
        onConfirm={run}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
