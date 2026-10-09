import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, Card, CardContent, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import toast from 'react-hot-toast';
import AuthImage from '../../components/AuthImage.jsx';
import { useAuthImage } from '../../hooks/useAuthImage.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useAddOrderImageMutation, useRemoveOrderImageMutation } from './orderApi.js';

function Zoomed({ fileId, onClose }) {
  const src = useAuthImage(fileId ? `/files/${fileId}` : null);
  return (
    <Dialog open={Boolean(fileId)} onClose={onClose} maxWidth="md">
      {src && <Box component="img" src={src} alt="Design" sx={{ display: 'block', maxWidth: '100%', maxHeight: '80vh' }} />}
    </Dialog>
  );
}

/** The customer's reference design photos for an order (the karigar works from these). */
export default function OrderPhotos({ order, canEdit }) {
  const [add, { isLoading: uploading }] = useAddOrderImageMutation();
  const [remove] = useRemoveOrderImageMutation();
  const [zoom, setZoom] = useState(null);
  const images = order.images ?? [];

  const upload = async (files) => {
    for (const file of files) {
      try {
        await add({ id: order.id, file }).unwrap();
      } catch (err) {
        toast.error(getErrorMessage(err));
        break;
      }
    }
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h4" sx={{ mb: 2 }}>
          Design photos
        </Typography>
        {images.length === 0 && !canEdit ? (
          <Typography variant="body2" color="textSecondary">
            No reference photos.
          </Typography>
        ) : (
          <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
            {images.map((fileId) => (
              <Box key={fileId} sx={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setZoom(fileId)}>
                <AuthImage fileId={fileId} alt="Design photo" size={112} sx={{ borderRadius: 2 }} />
                {canEdit && (
                  <IconButton
                    size="small"
                    aria-label="Remove photo"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await remove({ id: order.id, fileId }).unwrap();
                      toast.success('Photo removed');
                    }}
                    sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}
                  >
                    <CloseRoundedIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
              </Box>
            ))}
            {canEdit && images.length < 6 && (
              <Button component="label" variant="outlined" color="secondary" loading={uploading} sx={{ width: 112, height: 112, flexDirection: 'column', gap: 0.5, borderStyle: 'dashed' }}>
                <AddPhotoAlternateOutlinedIcon />
                <Typography variant="caption">Add photo</Typography>
                <input hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => upload(Array.from(e.target.files ?? []).slice(0, 6 - images.length))} />
              </Button>
            )}
          </Stack>
        )}
      </CardContent>
      <Zoomed fileId={zoom} onClose={() => setZoom(null)} />
    </Card>
  );
}
