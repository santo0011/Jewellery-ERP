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
            success: { iconTheme: { primary: '#C9A227', secondary: '#171717' } },
          }}
        />
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);

