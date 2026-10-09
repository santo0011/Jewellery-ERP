import { Box } from '@mui/material';
import JsBarcode from 'jsbarcode';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef } from 'react';

export default function BarcodeView({ value, symbology = 'code128', height = 56 }) {
  const ref = useRef(null);

  useEffect(() => {
    if (symbology !== 'code128' || !ref.current || !value) return;
    JsBarcode(ref.current, value, { format: 'CODE128', height, width: 1.6, margin: 0, fontSize: 13, font: 'Inter', background: 'transparent', lineColor: '#171717' });
  }, [value, symbology, height]);

  if (!value) return null;
  return (
    <Box sx={{ display: 'inline-flex', p: 1.5, bgcolor: '#fff', borderRadius: 1, border: 1, borderColor: 'divider' }}>
      {symbology === 'qr' ? <QRCodeSVG value={value} size={height * 1.6} marginSize={0} /> : <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />}
    </Box>
  );
}
