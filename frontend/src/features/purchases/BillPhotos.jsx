import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, Card, CardContent, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AuthImage from '../../components/AuthImage.jsx';
import { useAuthImage } from '../../hooks/useAuthImage.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useAddBillImageMutation, useRemoveBillImageMutation } from './purchaseApi.js';
import { t } from '../../i18n/index.js';

export const MAX_BILL_IMAGES = 5;
export const MAX_BILL_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';
const TILE = 112;

/** Keeps the files the server will take (type and size), warning about the rest. */
export function acceptableBillFiles(files, room) {
  const ok = [];
  for (const f of files) {
    if (!ACCEPT.split(',').includes(f.type)) toast.error(t('{{name}}: use a PNG, JPEG or WebP photo', { name: f.name }));
    else if (f.size > MAX_BILL_IMAGE_BYTES) toast.error(t('{{name}}: photo must be 5 MB or smaller', { name: f.name }));
    else ok.push(f);
  }
  if (ok.length > room) toast.error(t('A bill can have up to {{MAX_BILL_IMAGES}} photos', { MAX_BILL_IMAGES }));
  return ok.slice(0, Math.max(0, room));
}

const removeButtonSx = { position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } };

function AddTile({ onFiles, loading, label = t('Add bill photo') }) {
  return (
    <Button component="label" variant="outlined" color="secondary" loading={loading} sx={{ width: TILE, height: TILE, flexDirection: 'column', gap: 0.5, borderStyle: 'dashed', textAlign: 'center' }}>
      <AddPhotoAlternateOutlinedIcon />
      <Typography variant="caption" sx={{ lineHeight: 1.2 }}>
        {label}
      </Typography>
      <input
        hidden
        type="file"
        accept={ACCEPT}
        multiple
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = ''; // let the same file be picked again after removing it
        }}
      />
    </Button>
  );
}

function Zoomed({ src, onClose }) {
  return (
    <Dialog open={Boolean(src)} onClose={onClose} maxWidth="lg">
      {src && <Box component="img" src={src} alt={t('Supplier bill')} sx={{ display: 'block', maxWidth: '100%', maxHeight: '85vh' }} />}
    </Dialog>
  );
}

function ZoomedStored({ fileId, onClose }) {
  const src = useAuthImage(fileId ? `/files/${fileId}` : null);
  return <Zoomed src={fileId ? src : null} onClose={onClose} />;
}

/** Photos picked on the new-purchase form, held in the browser until the purchase is saved. */
export function BillPhotoPicker({ files, onChange }) {
  const [previews, setPreviews] = useState([]);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  return (
    <>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
        {previews.map((src, i) => (
          <Box key={src} sx={{ position: 'relative', width: TILE, height: TILE, borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider', cursor: 'zoom-in' }} onClick={() => setZoom(src)}>
            <Box component="img" src={src} alt={files[i]?.name ?? t('Bill photo')} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <IconButton
              size="small"
              aria-label={t('Remove photo')}
              onClick={(e) => {
                e.stopPropagation();
                onChange(files.filter((_, j) => j !== i));
              }}
              sx={removeButtonSx}
            >
              <CloseRoundedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        ))}
        {files.length < MAX_BILL_IMAGES && <AddTile onFiles={(picked) => onChange([...files, ...acceptableBillFiles(picked, MAX_BILL_IMAGES - files.length)])} />}
      </Stack>
      <Zoomed src={zoom} onClose={() => setZoom(null)} />
    </>
  );
}

/** Photos or scans of the supplier's paper bill, on a saved purchase. */
export default function BillPhotos({ purchase, canEdit }) {
  const [add, { isLoading: uploading }] = useAddBillImageMutation();
  const [remove] = useRemoveBillImageMutation();
  const [zoom, setZoom] = useState(null);
  const images = purchase.billImages ?? [];

  const upload = async (picked) => {
    for (const file of acceptableBillFiles(picked, MAX_BILL_IMAGES - images.length)) {
      try {
        await add({ id: purchase.id, file }).unwrap();
      } catch (err) {
        toast.error(getErrorMessage(err));
        break;
      }
    }
  };

  const removeImage = async (fileId) => {
    try {
      await remove({ id: purchase.id, fileId }).unwrap();
      toast.success(t('Bill photo removed'));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          {t('Bill photos')}
        </Typography>
        {images.length === 0 && !canEdit ? (
          <Typography variant="body2" color="textSecondary">
            {t('No photo of the bill was attached.')}
          </Typography>
        ) : (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
            {images.map((fileId) => (
              <Box key={fileId} sx={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setZoom(fileId)}>
                <AuthImage fileId={fileId} alt={t('Supplier bill')} size={TILE} sx={{ borderRadius: 2 }} />
                {canEdit && (
                  <IconButton
                    size="small"
                    aria-label={t('Remove bill photo')}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(fileId);
                    }}
                    sx={removeButtonSx}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              </Box>
            ))}
            {canEdit && images.length < MAX_BILL_IMAGES && <AddTile onFiles={upload} loading={uploading} />}
          </Stack>
        )}
      </CardContent>
      <ZoomedStored fileId={zoom} onClose={() => setZoom(null)} />
    </Card>
  );
}
