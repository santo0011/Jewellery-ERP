import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Stack, Tooltip } from '@mui/material';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useDeleteRecordMutation, useLazyDeleteCheckQuery } from '../services/recordApi.js';
import { getErrorMessage } from '../utils/errors.js';
import ViewButton from './ViewButton.jsx';

/** A Delete button that cannot be used, with the reason on hover — every table keeps the same set of buttons. */
export function DisabledDelete({ reason, size = 'small' }) {
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

/**
 * Delete for one record. `status` (from useDeleteStatus) disables the button up front when the record cannot be
 * deleted. On click the server is asked again: if something now uses the record, the dialog says what (and what to
 * do instead); otherwise it asks to confirm. `onDeleted` runs after a successful delete.
 */
export function DeleteAction({ type, id, name, status, onDeleted, size = 'small' }) {
  const [open, setOpen] = useState(false);
  const [check, { data, isFetching, error }] = useLazyDeleteCheckQuery();
  const [remove, { isLoading }] = useDeleteRecordMutation();
  const ready = open && !isFetching && data && String(data.id) === String(id);

  const start = () => {
    setOpen(true);
    check({ type, id });
  };
  const close = () => !isLoading && setOpen(false);
  const confirm = async () => {
    try {
      await remove({ type, id }).unwrap();
      toast.success(`${data?.name ?? name} deleted`);
      setOpen(false);
      onDeleted?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
      check({ type, id }); // show what now uses it
    }
  };

  if (status && !status.deletable && !open) return <DisabledDelete reason={status.message} size={size} />;

  return (
    <>
      <Tooltip title="Delete">
        <IconButton size={size} color="error" onClick={start} aria-label={`Delete ${name}`}>
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        {!ready && !error ? (
          <DialogContent sx={{ display: 'grid', placeItems: 'center', py: 5 }}>
            <CircularProgress size={28} />
          </DialogContent>
        ) : error ? (
          <>
            <DialogTitle sx={{ fontWeight: 600 }}>Delete {name}?</DialogTitle>
            <DialogContent>
              <DialogContentText>{getErrorMessage(error)}</DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={close}>Close</Button>
            </DialogActions>
          </>
        ) : data.deletable ? (
          <>
            <DialogTitle sx={{ fontWeight: 600 }}>Delete {data.name}?</DialogTitle>
            <DialogContent>
              <DialogContentText>Nothing else uses this record, so it can be deleted. This cannot be undone; the audit log keeps a note of it.</DialogContentText>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button color="secondary" onClick={close} disabled={isLoading}>
                Cancel
              </Button>
              <Button variant="contained" color="error" onClick={confirm} loading={isLoading}>
                Delete
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
              <InfoOutlinedIcon color="warning" /> Can’t delete {data.name}
            </DialogTitle>
            <DialogContent>
              <DialogContentText>{data.message}</DialogContentText>
              {data.usedBy.length > 0 && (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mt: 1.5 }}>
                  {data.usedBy.map((u) => (
                    <Chip key={u.model} size="small" label={u.label} variant="outlined" />
                  ))}
                </Stack>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button variant="contained" onClick={close}>
                OK
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </>
  );
}

/**
 * The Action cell of a table: View, Edit and Delete.
 *   onView / onEdit          handlers (Edit opens the record's form straight from the table)
 *   deleteType + id + name   Delete through the shared delete flow; `deleteStatus` (useDeleteStatus) disables it
 *                            with the reason when the record cannot be deleted
 *   deleteDisabled           a reason: shows Delete disabled (records that are never deleted, e.g. invoices)
 */
export default function RowActions({ onView, viewTitle, onEdit, editTitle = 'Edit', deleteType, deleteStatus, deleteDisabled, id, name, onDeleted, children }) {
  return (
    <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
      {onView && <ViewButton onClick={onView} title={viewTitle} name={name} />}
      {onEdit && (
        <Tooltip title={editTitle}>
          <IconButton size="small" onClick={onEdit} aria-label={`${editTitle}: ${name}`}>
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {children}
      {deleteDisabled ? (
        <DisabledDelete reason={deleteDisabled} />
      ) : (
        deleteType &&
        id && (
          <Box component="span">
            <DeleteAction type={deleteType} id={id} name={name} status={deleteStatus} onDeleted={onDeleted} />
          </Box>
        )
      )}
    </Stack>
  );
}

/** Width of an Action column holding `n` icon buttons. */
export const actionsWidth = (n) => 24 + n * 36;
