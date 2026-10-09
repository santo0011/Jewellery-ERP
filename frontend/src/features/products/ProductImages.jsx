import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import StarOutlineRoundedIcon from '@mui/icons-material/StarOutlineRounded';
import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import AuthImage from '../../components/AuthImage.jsx';
import { getErrorMessage } from '../../utils/errors.js';
import { useAddProductImageMutation, useRemoveProductImageMutation, useSetPrimaryProductImageMutation } from './productApi.js';

const MAX_IMAGES = 8;
const MAX_BYTES = 5 * 1024 * 1024;

export default function ProductImages({ product, canEdit }) {
  const input = useRef(null);
  const [selected, setSelected] = useState(0);
  const [addImage, { isLoading: uploading }] = useAddProductImageMutation();
  const [removeImage] = useRemoveProductImageMutation();
  const [setPrimary] = useSetPrimaryProductImageMutation();
  const images = product.images;
  const current = images[Math.min(selected, images.length - 1)];

  const upload = async (e) => {
    const files = [...(e.target.files ?? [])].slice(0, MAX_IMAGES - images.length);
    e.target.value = '';
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is larger than 5 MB`);
        continue;
      }
      try {
        await addImage({ id: product.id, file }).unwrap();
      } catch (err) {
        toast.error(getErrorMessage(err));
        break;
      }
    }
  };

  const act = async (fn, message) => {
    try {
      await fn().unwrap();
      toast.success(message);
      setSelected(0);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Box>
      <AuthImage fileId={current} alt={product.name} size="100%" sx={{ aspectRatio: '1 / 1', height: 'auto', borderRadius: 2 }} />
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
        {images.map((fileId, i) => (
          <Box
            key={fileId}
            onClick={() => setSelected(i)}
            sx={{ cursor: 'pointer', borderRadius: 1, outline: i === Math.min(selected, images.length - 1) ? 2 : 0, outlineColor: 'primary.main', outlineOffset: 2 }}
          >
            <AuthImage fileId={fileId} alt={`${product.name} ${i + 1}`} size={56} />
          </Box>
        ))}
      </Stack>
      {canEdit && (
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center' }}>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={upload} />
          <Button size="small" variant="outlined" color="secondary" startIcon={<AddPhotoAlternateOutlinedIcon />} onClick={() => input.current?.click()} loading={uploading} disabled={images.length >= MAX_IMAGES}>
            Add photos
          </Button>
          {current && (
            <>
              {images.indexOf(current) > 0 && (
                <Tooltip title="Make main photo">
                  <IconButton size="small" onClick={() => act(() => setPrimary({ id: product.id, fileId: current }), 'Main photo updated')} aria-label="Make main photo">
                    <StarOutlineRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="Remove photo">
                <IconButton size="small" color="error" onClick={() => act(() => removeImage({ id: product.id, fileId: current }), 'Photo removed')} aria-label="Remove photo">
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Typography variant="caption" color="textSecondary" sx={{ ml: 'auto' }}>
            {images.length}/{MAX_IMAGES}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
