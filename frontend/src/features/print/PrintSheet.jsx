import { Box, GlobalStyles } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import InvoiceDocument from './InvoiceDocument.jsx';
import { PRINT_SIZES } from './printLayouts.js';

/**
 * What the printer gets: every copy of the invoice, placed straight in <body> and hidden on screen. While printing
 * only this shows, on paper of the layout's size (@page). Mounted on the invoice page, so Ctrl+P prints it too.
 */
export function PrintSheet({ sale, layout, logo }) {
  const paper = PRINT_SIZES[layout.size] ?? PRINT_SIZES.a4;
  const copies = Math.max(1, layout.copies ?? 1);
  const thermal = layout.size !== 'a4';
  return createPortal(
    <>
      <GlobalStyles
        styles={{
          '#print-root': { display: 'none' },
          '@media print': {
            'body > *:not(#print-root)': { display: 'none !important' },
            'html, body': { background: '#fff !important', margin: 0, padding: 0 },
            '#print-root': { display: 'block' },
            '@page': { size: paper.page, margin: `${paper.marginMm}mm` },
          },
        }}
      />
      <div id="print-root">
        {Array.from({ length: copies }, (_, n) => (
          // A4: each copy on its own page. Thermal: copies one after another, with room to tear between.
          <Box key={n} sx={n < copies - 1 ? (thermal ? { pb: '10mm', mb: '6mm', borderBottom: '1px dashed #000' } : { breakAfter: 'page' }) : undefined}>
            <InvoiceDocument sale={sale} layout={layout} logo={logo} copy={copies > 1 ? n : null} />
          </Box>
        ))}
      </div>
    </>,
    document.body,
  );
}

/**
 * The invoice on a sheet of paper, scaled down to fit the space it is shown in (a phone shows the whole A4 page), or
 * at full size with `fit` off (scrolls sideways). The layout itself is the printed one, at the paper's real width.
 */
export function PaperPreview({ sale, layout, logo, maxScale = 1, fit: fitWidth = true }) {
  const paper = PRINT_SIZES[layout.size] ?? PRINT_SIZES.a4;
  const outer = useRef(null);
  const sheet = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: 'auto' });

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !sheet.current) return;
      const scale = fitWidth ? Math.min(maxScale, outer.current.clientWidth / sheet.current.offsetWidth) : 1;
      setFit({ scale, height: sheet.current.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer.current);
    observer.observe(sheet.current);
    return () => observer.disconnect();
  }, [maxScale, fitWidth]);

  return (
    <Box ref={outer} sx={{ width: '100%', overflow: fitWidth ? 'hidden' : 'auto' }}>
      <Box sx={{ height: fit.height, display: 'flex', justifyContent: fitWidth ? 'center' : 'flex-start' }}>
        <Box
          ref={sheet}
          sx={{
            flexShrink: 0,
            p: `${paper.marginMm}mm`,
            minHeight: layout.size === 'a4' ? '297mm' : undefined,
            bgcolor: '#fff',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.10)',
            borderRadius: layout.size === 'a4' ? 0.5 : 0,
            transform: `scale(${fit.scale})`,
            transformOrigin: 'top center',
          }}
        >
          <InvoiceDocument sale={sale} layout={layout} logo={logo} copy={(layout.copies ?? 1) > 1 ? 0 : null} />
        </Box>
      </Box>
    </Box>
  );
}
