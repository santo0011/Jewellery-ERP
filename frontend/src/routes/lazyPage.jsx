import { lazy, Suspense } from 'react';
import { PageLoading } from '../components/TopProgress.jsx';

const loaders = [];

const RELOADED_AT = 'jerp.reloadedForNewCode';

/**
 * A page's code can go missing from an open tab: after a new version is deployed, or when the dev server rebuilds.
 * The import then fails ("Failed to fetch dynamically imported module"); reloading once fetches the current code.
 * Not again within 10 seconds, so a real outage shows the error instead of reloading for ever.
 */
export function withReload(load) {
  return () =>
    load().catch((err) => {
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(RELOADED_AT)) || 0;
        if (Date.now() - last > 10000) {
          sessionStorage.setItem(RELOADED_AT, String(Date.now()));
          window.location.reload();
          return new Promise(() => {}); // keep the loading bar until the page reloads
        }
      } catch {
        /* storage unavailable */
      }
      throw err;
    });
}

/**
 * A page loaded only when it is first opened: the first screen downloads far less, so the app starts faster
 * (on a phone over Wi-Fi most of all). The top progress bar runs while the page's code arrives.
 */
export function lazyPage(load) {
  loaders.push(load);
  const Page = lazy(withReload(load));
  function LazyPage(props) {
    return (
      <Suspense fallback={<PageLoading />}>
        <Page {...props} />
      </Suspense>
    );
  }
  return LazyPage;
}

/** Once the app is idle, fetch the remaining pages in the background so moving between them stays instant. */
export function preloadPages() {
  const idle = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
  idle(() => {
    for (const load of loaders) load().catch(() => {});
  });
}
