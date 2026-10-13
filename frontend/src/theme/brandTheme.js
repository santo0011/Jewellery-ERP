/*
 * Organisation theme from its logo: find the logo's main colour, then derive a full, readable palette from it —
 * button colour and gradient, a dark tinted sidebar, a soft page tint, and text colours that pass WCAG contrast —
 * as CSS variables (the same ones the default gold theme declares in theme/index.js).
 */

// ---------------------------------------------------------------- colour maths

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const rgbToHex = (rgb) => `#${rgb.map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

function rgbToHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const hsl = (h, s, l) => rgbToHex(hslToRgb([h, clamp(s, 0, 1), clamp(l, 0, 1)]));

function luminance(hex) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Moves lightness (darker or lighter) until the colour reaches `ratio` against `surface`. */
function untilContrast(h, s, l, surface, ratio, step) {
  let L = l;
  for (let i = 0; i < 60 && contrast(hsl(h, s, L), surface) < ratio; i += 1) L = clamp(L + step, 0, 1);
  return hsl(h, s, L);
}

const channels = (hex) => hexToRgb(hex).join(' ');
const commaRgb = (hex) => hexToRgb(hex).join(', ');

// ---------------------------------------------------------------- the logo's main colour

/**
 * The logo's dominant brand colour as hex, or null when it has none worth theming with (black, white, grey or
 * mostly transparent). Pixels are grouped by hue, weighted by how vivid they are; the strongest hue family wins.
 */
export async function logoColor(src) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  const BINS = 36;
  const bins = Array.from({ length: BINS }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let opaque = 0;
  let colourful = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 160) continue; // transparent
    opaque += 1;
    const rgb = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = rgbToHsl(rgb);
    if (s < 0.22 || l < 0.08 || l > 0.93) continue; // white, black, grey
    colourful += 1;
    const w = s * (1 - Math.abs(l - 0.5) * 1.2);
    const bin = bins[Math.floor(h * BINS) % BINS];
    bin.w += w;
    bin.r += rgb[0] * w;
    bin.g += rgb[1] * w;
    bin.b += rgb[2] * w;
  }
  // Too little colour (a black-and-white logo, or a few coloured specks): keep the default theme.
  if (!opaque || colourful / opaque < 0.04) return null;

  let best = 0;
  let bestW = -1;
  for (let i = 0; i < BINS; i += 1) {
    const w = bins[(i + BINS - 1) % BINS].w + bins[i].w + bins[(i + 1) % BINS].w;
    if (w > bestW) {
      bestW = w;
      best = i;
    }
  }
  const family = [bins[(best + BINS - 1) % BINS], bins[best], bins[(best + 1) % BINS]];
  const total = family.reduce((s, b) => s + b.w, 0);
  if (!total) return null;
  return rgbToHex([family.reduce((s, b) => s + b.r, 0) / total, family.reduce((s, b) => s + b.g, 0) / total, family.reduce((s, b) => s + b.b, 0) / total]);
}

// ---------------------------------------------------------------- palette

const WHITE = '#FFFFFF';
const INK = '#171717';
const DARK_PAPER = '#232220';

/**
 * CSS variables for the brand colour in a colour mode: our brand variables plus MUI's primary / gold / accent
 * palette variables, so MUI buttons, focus rings and active states follow too.
 */
export function brandVariables(baseHex, mode = 'light') {
  const [h, s0] = rgbToHsl(hexToRgb(baseHex));
  const s = clamp(s0, 0.45, 0.85);
  const [, , l0] = rgbToHsl(hexToRgb(baseHex));
  const dark = mode === 'dark';

  const start = hsl(h, s, dark ? clamp(l0, 0.5, 0.62) : clamp(l0, 0.38, 0.56));
  // Text on brand fills (buttons, active menu, badges): whichever of ink or white reads better — then the fill is
  // nudged darker (for white text) or lighter (for ink) until that text passes 4.5:1, as mid-tones need.
  const onBrand = contrast(start, INK) >= contrast(start, WHITE) ? INK : WHITE;
  const main = untilContrast(h, s, rgbToHsl(hexToRgb(start))[2], onBrand, 4.5, onBrand === WHITE ? -0.01 : +0.01);
  const [, , lm] = rgbToHsl(hexToRgb(main));
  const light = hsl(h, s, Math.min(lm + 0.18, 0.8));
  const deep = hsl(h, s, Math.max(lm - 0.1, 0.2));
  // Text and icons in the brand colour: dark enough on white (light mode) or light enough on dark paper.
  const strong = dark ? untilContrast(h, s, lm, DARK_PAPER, 4.5, +0.02) : untilContrast(h, s, lm, WHITE, 4.5, -0.02);
  const mark = dark ? untilContrast(h, s, lm, DARK_PAPER, 3, +0.02) : untilContrast(h, s, lm, WHITE, 3, -0.02);

  // A deep, low-saturation sidebar in the brand's hue, so the logo's colour runs through the whole frame.
  const ss = Math.min(s, 0.32);
  const sidebar = {
    '--sidebar-bg': hsl(h, ss, 0.085),
    '--sidebar-surface': `linear-gradient(180deg, ${hsl(h, ss, 0.12)} 0%, ${hsl(h, ss, 0.085)} 55%, ${hsl(h, ss, 0.06)} 100%)`,
    '--sidebar-text': hsl(h, 0.14, 0.86),
    '--sidebar-muted': hsl(h, 0.08, 0.6),
  };
  const headFill = dark ? [hsl(h, 0.1, 0.165), hsl(h, 0.1, 0.14)] : [hsl(h, 0.5, 0.975), hsl(h, 0.42, 0.935)];
  const headText = dark ? untilContrast(h, 0.45, 0.68, headFill[1], 4.5, +0.02) : untilContrast(h, 0.35, 0.38, headFill[1], 4.5, -0.02);
  const page = dark ? hsl(h, 0.08, 0.115) : hsl(h, 0.32, 0.965);

  return {
    '--brand': main,
    '--brand-rgb': commaRgb(main),
    '--brand-strong': strong,
    '--brand-strong-rgb': commaRgb(strong),
    '--brand-light': light,
    '--brand-deep': deep,
    '--brand-contrast': onBrand,
    '--brand-mark': mark,
    ...sidebar,
    '--table-head-fill': `linear-gradient(180deg, ${headFill[0]} 0%, ${headFill[1]} 100%)`,
    '--table-head-text': headText,
    // MUI palette (with cssVariables, components read these).
    '--mui-palette-primary-main': main,
    '--mui-palette-primary-mainChannel': channels(main),
    '--mui-palette-primary-dark': deep,
    '--mui-palette-primary-darkChannel': channels(deep),
    '--mui-palette-primary-light': light,
    '--mui-palette-primary-lightChannel': channels(light),
    '--mui-palette-primary-contrastText': onBrand,
    '--mui-palette-primary-contrastTextChannel': channels(onBrand),
    '--mui-palette-gold-main': main,
    '--mui-palette-gold-mainChannel': channels(main),
    '--mui-palette-gold-dark': strong,
    '--mui-palette-gold-darkChannel': channels(strong),
    '--mui-palette-accent-main': strong,
    '--mui-palette-accent-mainChannel': channels(strong),
    '--mui-palette-background-default': page,
    '--mui-palette-background-defaultChannel': channels(page),
  };
}
