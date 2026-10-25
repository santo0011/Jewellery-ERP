import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { Box, Button, Card, CardContent, Stack, Typography } from '@mui/material';
import { useRef } from 'react';
import toast from 'react-hot-toast';
import { DiamondMark } from '../../components/Wordmark.jsx';
import { useOrganisationLogo } from '../../hooks/useOrganisationLogo.js';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useRemoveLogoMutation, useUploadLogoMutation } from './organisationApi.js';
import { t } from '../../i18n/index.js';

const MAX_BYTES = 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';

/** The organisation's logo: shown in the sidebar and printed on invoices. Upload, replace or remove it. */
export default function LogoCard({ canEdit, title = t('Logo'), caption = t('Shown at the top of the sidebar and printed on invoices and receipts. PNG, JPEG or WebP up to 1 MB.') }) {
  const input = useRef(null);
  const { data: session } = useSession();
  const hasLogo = Boolean(session?.organisation?.logoVersion);
  const logoUrl = useOrganisationLogo();
  const [uploadLogo, { isLoading: uploading }] = useUploadLogoMutation();
  const [removeLogo, { isLoading: removing }] = useRemoveLogoMutation();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error(t('Logo must be 1 MB or smaller'));
      return;
    }
    try {
      await uploadLogo(file).unwrap();
      toast.success(t('Logo updated'));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const onRemove = async () => {
    try {
      await removeLogo().unwrap();
      toast.success(t('Logo removed'));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="overline" color="textSecondary">
          {title}
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
          {logoUrl ? <Box component="img" src={logoUrl} alt={t('Organisation logo')} sx={{ maxHeight: 96, maxWidth: '90%', objectFit: 'contain' }} /> : <DiamondMark size={40} />}
        </Box>
        <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
          {caption}
        </Typography>
        {/* The panel's colours come from the logo (useBrandTheme); this shows the colour in use. */}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center' }}>
          <Box sx={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--brand-light), var(--brand) 55%, var(--brand-deep))', boxShadow: '0 0 0 2px var(--mui-palette-background-paper), 0 0 0 3px rgba(var(--brand-rgb), 0.5)' }} />
          <Typography variant="caption" color="textSecondary">
            {hasLogo ? t('Panel colours are taken from this logo and update when it changes. A black-and-white logo keeps the gold theme.') : t('Upload a logo and the panel’s colours will match it.')}
          </Typography>
        </Stack>
        {canEdit && (
          <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={onFile} />
            <Button variant="outlined" color="secondary" startIcon={<CloudUploadOutlinedIcon />} onClick={() => input.current?.click()} loading={uploading}>
              {hasLogo ? t('Replace') : t('Upload')}
            </Button>
            {hasLogo && (
              <Button color="error" onClick={onRemove} loading={removing}>
                {t('Remove')}
              </Button>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
