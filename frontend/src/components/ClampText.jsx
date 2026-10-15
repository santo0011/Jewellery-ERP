import { Tooltip, Typography } from '@mui/material';
import { useLayoutEffect, useRef, useState } from 'react';

const perBreakpoint = (lines, fn) => (typeof lines === 'object' ? Object.fromEntries(Object.entries(lines).map(([bp, n]) => [bp, fn(n)])) : fn(lines));

/**
 * Text cut to a few lines with "…" — `lines` is a number or per breakpoint ({ xs: 2, sm: 1 }). When it is cut,
 * hovering (or a tap on a phone) shows all of it, so nothing is lost. `reserve` keeps the height of all those lines
 * even for short text, so cards side by side line up.
 */
export default function ClampText({ lines = 2, reserve = false, lineHeight = 1.4, sx, children, ...props }) {
  const ref = useRef(null);
  const [cut, setCut] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setCut(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, lines]);

  return (
    <Tooltip title={cut ? children : ''} enterTouchDelay={0} leaveTouchDelay={5000} placement="top" arrow>
      <Typography
        ref={ref}
        {...props}
        sx={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: perBreakpoint(lines, (n) => n),
          overflow: 'hidden',
          overflowWrap: 'anywhere',
          lineHeight,
          ...(reserve && { minHeight: perBreakpoint(lines, (n) => `${n * lineHeight}em`) }),
          ...sx,
        }}
      >
        {children}
      </Typography>
    </Tooltip>
  );
}
