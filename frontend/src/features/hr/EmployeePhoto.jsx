import CameraAltOutlinedIcon from '@mui/icons-material/CameraAltOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Box, Button, ButtonBase, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuthImage } from '../../hooks/useAuthImage.js';
import { fonts, tokens } from '../../theme/tokens.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useRemoveEmployeePhotoMutation, useSetEmployeePhotoMutation } from './hrApi.js';

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';

const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

/** Round photo, or gold initials when there is none. `src` overrides the stored photo (e.g. a local preview). */
export function EmployeeAvatar({ employee, name, size = 40, src: override, sx }) {
  const stored = useAuthImage(!override && employee?.photoFileId ? `/files/${employee.photoFileId}` : null);
  const src = override ?? stored;
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: src ? 'transparent' : tokens.sidebar.goldGradient,
        color: '#171717',
        fontFamily: fonts.display,
        fontWeight: 700,
        fontSize: size * 0.42,
        boxShadow: '0 0 0 2px rgba(201, 162, 39, 0.25)',
        ...sx,
      }}
    >
      {src ? <Box component="img" src={src} alt={name ?? employee?.name ?? ''} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(name ?? employee?.name) || '?'}
    </Box>
  );
}

const tooBig = (file) => {
  if (file.size <= PHOTO_MAX_BYTES) return false;
  toast.error('Photo must be 2 MB or smaller');
  return true;
};

/** Photo picker for the employee form: previews the chosen file; the form uploads it after saving. */
export function PhotoPicker({ employee, name, file, onChange, removed, onRemove }) {
  const input = useRef(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const hasPhoto = Boolean(file) || (Boolean(employee?.photoFileId) && !removed);
  const pick = (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    if (chosen && !tooBig(chosen)) onChange(chosen);
  };

  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
      <ButtonBase onClick={() => input.current?.click()} aria-label="Choose photo" sx={{ borderRadius: '50%', position: 'relative', '&:hover .photo-overlay': { opacity: 1 } }}>
        <EmployeeAvatar employee={removed ? null : employee} name={name || employee?.name} size={72} src={preview ?? undefined} />
        <Box className="photo-overlay" sx={{ position: 'absolute', inset: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(23, 23, 23, 0.45)', color: '#fff', opacity: 0, transition: 'opacity 160ms ease' }}>
          <CameraAltOutlinedIcon fontSize="small" />
        </Box>
      </ButtonBase>
      <Box>
        <Typography variant="subtitle2">Photo</Typography>
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 0.75 }}>
          PNG, JPEG or WebP, up to 2 MB.
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<CameraAltOutlinedIcon />} onClick={() => input.current?.click()}>
            {hasPhoto ? 'Change' : 'Upload'}
          </Button>
          {hasPhoto && (
            <Button size="small" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => (file ? onChange(null) : onRemove())}>
              Remove
            </Button>
          )}
        </Stack>
      </Box>
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} />
    </Stack>
  );
}

/** Large photo for the employee page, with change / remove for users who can edit. */
export function EmployeePhotoEditor({ employee, canEdit, size = 96 }) {
  const input = useRef(null);
  const [setPhoto, setState] = useSetEmployeePhotoMutation();
  const [removePhoto, removeState] = useRemoveEmployeePhotoMutation();
  const busy = setState.isLoading || removeState.isLoading;

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || tooBig(file)) return;
    try {
      await setPhoto({ id: employee.id, file }).unwrap();
      toast.success('Photo updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  const remove = async () => {
    try {
      await removePhoto(employee.id).unwrap();
      toast.success('Photo removed');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Stack spacing={1} sx={{ alignItems: 'center' }}>
      <Box sx={{ position: 'relative' }}>
        <EmployeeAvatar employee={employee} size={size} sx={{ boxShadow: '0 0 0 3px rgba(201, 162, 39, 0.35), 0 8px 20px rgba(23, 23, 23, 0.15)' }} />
        {busy && (
          <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(23, 23, 23, 0.4)' }}>
            <CircularProgress size={28} sx={{ color: '#fff' }} />
          </Box>
        )}
        {canEdit && !busy && (
          <ButtonBase
            onClick={() => input.current?.click()}
            aria-label={employee.photoFileId ? 'Change photo' : 'Upload photo'}
            sx={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: '50%', background: tokens.sidebar.goldGradient, color: '#171717', boxShadow: '0 2px 8px rgba(23, 23, 23, 0.25)', border: '2px solid', borderColor: 'background.paper' }}
          >
            <CameraAltOutlinedIcon sx={{ fontSize: 16 }} />
          </ButtonBase>
        )}
      </Box>
      {canEdit && employee.photoFileId && (
        <Button size="small" color="error" onClick={remove} disabled={busy} sx={{ minHeight: 0, py: 0.25 }}>
          Remove photo
        </Button>
      )}
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} />
    </Stack>
  );
}
