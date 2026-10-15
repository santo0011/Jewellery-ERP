import { Box } from '@mui/material';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSelector } from 'react-redux';

// Pages still downloading (lazy routes), counted so the bar shows while any is on its way.
let pagesLoading = 0;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Mount while a page's code downloads: the top bar runs until it unmounts. Used as the Suspense fallback. */
export function PageLoading() {
  useEffect(() => {
    pagesLoading += 1;
    notify();
    return () => {
      pagesLoading -= 1;
      notify();
    };
  }, []);
  return <Box sx={{ minHeight: '40vh' }} />;
}

/**
 * Busy when a query loads for the first time (a new page, filter or page of a table) or anything is being saved.
 * Background refreshes of data already on screen (polling, refetch after a save) do not run the bar.
 */
const apiBusy = (api) =>
  Object.values(api?.queries ?? {}).some((q) => q?.status === 'pending' && q.data === undefined) ||
  Object.values(api?.mutations ?? {}).some((m) => m?.status === 'pending');

const SHOW_AFTER_MS = 120; // quick answers never flash the bar
const TRICKLE_MS = 250;

/**
 * YouTube-style progress line along the top of the screen: creeps towards the end while pages or data load, then
 * fills and fades out.
 */
export default function TopProgress() {
  const loadingPage = useSyncExternalStore(subscribe, () => pagesLoading > 0);
  const loadingData = useSelector((state) => apiBusy(state.api) || apiBusy(state.platformApi));
  const busy = loadingPage || loadingData;

  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const running = useRef(false);

  useEffect(() => {
    if (busy) {
      const timers = [];
      timers.push(
        setTimeout(() => {
          running.current = true;
          setVisible(true);
          setWidth((w) => (w >= 90 ? 8 : Math.max(w, 8)));
          timers.push(setInterval(() => setWidth((w) => w + (90 - w) * 0.12), TRICKLE_MS));
        }, running.current ? 0 : SHOW_AFTER_MS),
      );
      return () => timers.forEach((t) => clearTimeout(t) || clearInterval(t));
    }
    if (!running.current) return undefined;
    // Done: fill to the end, then fade out and reset.
    setWidth(100);
    const hide = setTimeout(() => setVisible(false), 250);
    const reset = setTimeout(() => {
      running.current = false;
      setWidth(0);
    }, 600);
    return () => {
      clearTimeout(hide);
      clearTimeout(reset);
    };
  }, [busy]);

  return (
    <Box
      role="progressbar"
      aria-hidden={!visible}
      aria-label="Loading"
      sx={{
        position: 'fixed',
        top: 'env(safe-area-inset-top)',
        left: 0,
        right: 0,
        height: 3,
        zIndex: (theme) => theme.zIndex.tooltip + 1,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 300ms ease',
      }}
    >
      <Box
        sx={{
          height: '100%',
          width: `${width}%`,
          bgcolor: 'var(--brand)',
          boxShadow: '0 0 8px rgba(var(--brand-rgb), 0.6), 0 0 4px rgba(var(--brand-rgb), 0.4)',
          borderRadius: '0 2px 2px 0',
          transition: width === 0 ? 'none' : 'width 250ms ease-out',
        }}
      />
    </Box>
  );
}
