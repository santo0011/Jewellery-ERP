import { useColorScheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { brandVariables, logoColor } from '../theme/brandTheme.js';

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
 * a clear colour, keeps the default gold. Leaving the panel (sign out, Super Admin) restores the defaults.
 * Returns the detected colour (hex) or null.
 */
export function useBrandTheme(logoUrl, logoVersion) {
  const { mode, systemMode } = useColorScheme();
  const scheme = (mode === 'system' ? systemMode : mode) === 'dark' ? 'dark' : 'light';
  const [color, setColor] = useState(() => (logoVersion ? (readCache(logoVersion) ?? null) : null));

  useEffect(() => {
    if (!logoVersion) {
      setColor(null);
      return undefined;
    }
    const cached = readCache(logoVersion);
    if (cached !== undefined) {
      setColor(cached);
      return undefined;
    }
    if (!logoUrl) return undefined;
    let cancelled = false;
    logoColor(logoUrl)
      .then((hex) => {
        writeCache(logoVersion, hex);
        if (!cancelled) setColor(hex);
      })
      .catch(() => !cancelled && setColor(null));
    return () => {
      cancelled = true;
    };
  }, [logoUrl, logoVersion]);

  useEffect(() => {
    if (!color) return undefined;
    const root = document.documentElement;
    const vars = brandVariables(color, scheme);
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
    };
  }, [color, scheme]);

  return color;
}
