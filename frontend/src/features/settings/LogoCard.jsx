import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { DiamondMark } from '../../components/Wordmark.jsx';
import { useOrganisationLogo } from '../../hooks/useOrganisationLogo.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useRemoveLogoMutation, useUploadLogoMutation } from './organisationApi.js';

const MAX_BYTES = 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';

export default function LogoCard({ hasLogo, canEdit }) {
  const input = useRef(null);
  const [version, setVersion] = useState(0);
  const logoUrl = useOrganisationLogo(hasLogo, version);
  const [uploadLogo, { isLoading: uploading }] = useUploadLogoMutation();
  const [removeLogo, { isLoading: removing }] = useRemoveLogoMutation();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error('Logo must be 1 MB or smaller');
      return;
    }
    try {
      await uploadLogo(file).unwrap();
      setVersion((v) => v + 1);
      toast.success('Logo updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const onRemove = async () => {
    try {
      await removeLogo().unwrap();
      toast.success('Logo removed');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="textSecondary">
          Logo
        </Typography>
        <Box
          sx={{
            mt: 1,
            height: 120,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'soft.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {logoUrl ? <Box component="img" src={logoUrl} alt="Organisation logo" sx={{ maxHeight: 96, maxWidth: '90%', objectFit: 'contain' }} /> : <DiamondMark size={40} />}
        </Box>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          Printed on invoices and receipts. PNG, JPEG or WebP up to 1 MB.
        </Typography>
        {canEdit && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={onFile} />
            <Button variant="outlined" color="secondary" startIcon={<CloudUploadOutlinedIcon />} onClick={() => input.current?.click()} loading={uploading}>
              {hasLogo ? 'Replace' : 'Upload'}
            </Button>
            {hasLogo && (
              <Button color="error" onClick={onRemove} loading={removing}>
                Remove
              </Button>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
