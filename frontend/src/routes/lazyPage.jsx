import { lazy, Suspense } from 'react';
import { LoadingState } from '../components/StateViews.jsx';

const loaders = [];

/**
 * A page loaded only when it is first opened: the first screen downloads far less, so the app starts faster
 * (on a phone over Wi-Fi most of all). Shows a spinner while the page's code arrives.
 */
export function lazyPage(load) {
  loaders.push(load);
  const Page = lazy(load);
  function LazyPage(props) {
    return (
      <Suspense fallback={<LoadingState />}>
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
