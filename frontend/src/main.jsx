import { loadLanguage } from './i18n/index.js';

const RELOADED_AT = 'jerp.reloadedForNewCode';

// The chosen language's words load first, so every screen, menu and message is built in it (see i18n/index.js).
loadLanguage()
  .catch(() => {
    /* words not loaded: the app shows in English */
  })
  .then(() => import('./app.jsx'))
  .catch((err) => {
    // The app's code changed under an open tab (new version, or the dev server rebuilt): reload once to fetch it.
    try {
      if (Date.now() - (Number(sessionStorage.getItem(RELOADED_AT)) || 0) > 10000) {
        sessionStorage.setItem(RELOADED_AT, String(Date.now()));
        window.location.reload();
        return;
      }
    } catch {
      /* storage unavailable */
    }
    throw err;
  });
