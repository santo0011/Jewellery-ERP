import { Capacitor } from '@capacitor/core';

/**
 * Runs only inside the Android / iPhone app (Capacitor); the website never loads the native plugins.
 * The phone's Back button goes back a screen (and closes the app on the first one); the status bar matches the app.
 */
export async function setupNativeApp() {
  if (!Capacitor.isNativePlatform()) return;
  const [{ App }, { StatusBar, Style }] = await Promise.all([import('@capacitor/app'), import('@capacitor/status-bar')]);
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else App.exitApp();
  });
  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#171717' });
  } catch {
    /* not available on this platform */
  }
}
