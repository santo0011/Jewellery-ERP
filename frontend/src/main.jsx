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
import { router } from './routes/index.jsx';
import { preloadPages } from './routes/lazyPage.jsx';
import { setupNativeApp } from './native.js';
import { AuthBootstrap } from './routes/guards.jsx';
import { store } from './store/index.js';
import { theme } from './theme/index.js';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme} defaultMode="light">
        <CssBaseline />
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
