import { useColorScheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { applyBrandColor, applyFavicon, applyRememberedBrand, logoIcon, readBrand, rememberBrand } from '../theme/brandMemory.js';
import { logoColor } from '../theme/brandTheme.js';

const cacheKey = (version) => `jerp.brandColor.${version}`;
const readCache = (version) => {
  try {
    const v = localStorage.getItem(cacheKey(version));
    return v === null ? undefined : v === 'none' ? null : v;
  } catch {
    return undefined;
  }
};
const writeCache = (version, hex) => {
  try {
    localStorage.setItem(cacheKey(version), hex ?? 'none');
  } catch {
    /* storage unavailable: detect again next time */
  }
};

/**
 * Themes the Organisation Panel from its logo. The logo's main colour is detected once per logo (cached by its
 * version, so later visits apply it at once), turned into a palette for the current light/dark mode and set as CSS
 * variables on the page root — so dialogs and menus follow too. A new logo re-themes; no logo, or a logo without
 * a clear colour, keeps the default gold. The colour and a small copy of the logo are remembered for this device, so the
 * sign-in page, the loading screen and the tab icon wear them too — also after signing out (see brandMemory).
 *
 * `logoVersion` undefined means the session has not loaded yet: nothing is changed then, so the colours remembered
 * at start-up stay on (a refresh does not flash the default gold); null means the organisation has no logo.
 * Returns the colour (hex) or null.
 */
export function useBrandTheme(logoUrl, logoVersion) {
  const { mode, systemMode } = useColorScheme();
  const scheme = (mode === 'system' ? systemMode : mode) === 'dark' ? 'dark' : 'light';
  const [detected, setDetected] = useState({});

  // The colour: undefined while it is not known yet (session loading, or a new logo still being read).
  const color = logoVersion === undefined ? undefined : !logoVersion ? null : (readCache(logoVersion) ?? detected[logoVersion]);

  // A new logo: read its main colour once and cache it.
  useEffect(() => {
    if (!logoVersion || !logoUrl || readCache(logoVersion) !== undefined) return undefined;
    let cancelled = false;
    logoColor(logoUrl)
      .catch(() => null)
      .then((hex) => {
        writeCache(logoVersion, hex);
        if (!cancelled) setDetected((d) => ({ ...d, [logoVersion]: hex }));
      });
    return () => {
      cancelled = true;
    };
  }, [logoUrl, logoVersion]);

  useEffect(() => {
    if (color === undefined) return undefined;
    applyBrandColor(color, scheme);
    // Leaving the panel: back to the remembered organisation (the same one, on this device).
    return () => applyRememberedBrand();
  }, [color, scheme]);

  // Remember this organisation's colour and logo for the sign-in page, the loading screen and the tab icon.
  useEffect(() => {
    if (color === undefined) return undefined;
    let cancelled = false;
    const save = (icon) => {
      const brand = { version: logoVersion ?? null, color, icon };
      rememberBrand(brand);
      applyFavicon(brand);
    };
    const known = readBrand();
    if (!logoVersion) save(null);
    else if (known?.version === logoVersion && known.icon && known.color === color) applyFavicon(known);
    else if (logoUrl) logoIcon(logoUrl).then((icon) => !cancelled && save(icon));
    // The logo image is still loading: keep the colour now (and the icon once the image arrives).
    else save(known?.version === logoVersion ? (known.icon ?? null) : null);
    return () => {
      cancelled = true;
    };
  }, [logoUrl, logoVersion, color]);

  return color ?? null;
}
