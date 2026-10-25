import '@fontsource-variable/inter';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import { CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import TopProgress from './components/TopProgress.jsx';
import { router } from './routes/index.jsx';
import { preloadPages } from './routes/lazyPage.jsx';
import { setupNativeApp } from './native.js';
import { installNoLeadingZeros } from './utils/noLeadingZeros.js';
import { AuthBootstrap } from './routes/guards.jsx';
import { store } from './store/index.js';
import { applyRememberedBrand } from './theme/brandMemory.js';
import { theme } from './theme/index.js';

// Number boxes: typing after a "0" gives 25000, not 025000 (see utils/noLeadingZeros.js).
installNoLeadingZeros();

// Before the first paint: the colours and tab icon of the organisation last signed in on this device.
applyRememberedBrand();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme} defaultMode="light">
        <CssBaseline />
        <TopProgress />
        <AuthBootstrap>
          <RouterProvider router={router} />
        </AuthBootstrap>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { borderRadius: 8, fontSize: 14, background: '#171717', color: '#F7F3E8' },
            success: { iconTheme: { primary: 'var(--brand)', secondary: 'var(--brand-contrast)' } },
          }}
        />
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);

// In the built app, fetch the other pages in the background after the first screen (dev serves them on demand).
if (import.meta.env.PROD) preloadPages();

// Inside the Android / iPhone app: Back button and status bar (does nothing on the website).
setupNativeApp();
