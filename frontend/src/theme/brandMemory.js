import { brandVariables } from './brandTheme.js';

/**
 * The organisation last signed in on this device: its logo colour and a small copy of its logo. Applied as soon as
 * the app starts, so the sign-in page, the loading screen and the browser tab icon wear that organisation's colours
 * (not the default gold) — and stay that way after signing out.
 */
const KEY = 'jerp.brand.last';
const DEFAULT_ICON = '/favicon.svg';

export function readBrand() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? null;
  } catch {
    return null;
  }
}

export function rememberBrand(brand) {
  try {
    localStorage.setItem(KEY, JSON.stringify(brand));
  } catch {
    /* storage unavailable: the default colours show on the next start */
  }
}

/** The light or dark mode the app shows in (MUI keeps the choice in localStorage). */
export function currentScheme() {
  const root = document.documentElement;
  if (root.classList.contains('dark')) return 'dark';
  if (root.classList.contains('light')) return 'light';
  let mode = 'light';
  try {
    mode = localStorage.getItem('mui-mode') ?? 'light';
  } catch {
    /* default */
  }
  if (mode === 'system') return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return mode === 'dark' ? 'dark' : 'light';
}

let applied = [];
/** Sets the palette made from `color` on the page root (null: back to the default gold). */
export function applyBrandColor(color, scheme = currentScheme()) {
  const root = document.documentElement;
  for (const name of applied) root.style.removeProperty(name);
  applied = [];
  if (!color) return;
  const vars = brandVariables(color, scheme);
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  applied = Object.keys(vars);
}

/** The diamond mark in a colour, as an icon (for organisations without a logo). */
const diamondIcon = (color) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#171717"/><path d="M32 10 48 26 32 54 16 26Z" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round"/><path d="M16 26h32M25 26l7-16 7 16M25 26l7 28 7-28" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  )}`;

/** The browser tab icon: the logo, else the diamond in the logo's colour, else the default. */
export function applyFavicon(brand) {
  const href = brand?.icon ?? (brand?.color ? diamondIcon(brandVariables(brand.color, 'light')['--brand']) : DEFAULT_ICON);
  for (const rel of ['icon', 'apple-touch-icon']) {
    let link = document.querySelector(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement('link');
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = href;
    link.removeAttribute('type');
  }
}

/** Colours and tab icon of the organisation last signed in here (at start-up, and after leaving its panel). */
export function applyRememberedBrand() {
  const brand = readBrand();
  applyBrandColor(brand?.color ?? null);
  applyFavicon(brand);
}

/** The Super Admin panel: always the default colours and icon. */
export function applyDefaultBrand() {
  applyBrandColor(null);
  applyFavicon(null);
}

/** A small square copy of the logo (for the tab icon), as a data URL. */
export function logoIcon(src, size = 64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
