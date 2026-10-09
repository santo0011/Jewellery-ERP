import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import { Box } from '@mui/material';
import { useAuthImage } from '../hooks/useAuthImage.js';

export default function AuthImage({ fileId, alt, size = 48, sx }) {
  const src = useAuthImage(fileId ? `/files/${fileId}` : null);
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'soft.main',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...sx,
      }}
    >
      {src ? (
        <Box component="img" src={src} alt={alt} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <DiamondOutlinedIcon sx={{ fontSize: typeof size === 'number' ? size * 0.45 : 64, color: 'primary.main', opacity: 0.6 }} />
      )}
    </Box>
  );
}
