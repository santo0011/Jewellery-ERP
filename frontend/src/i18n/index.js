import { Fragment, createElement, isValidElement } from 'react';

/**
 * The app's languages. English text is the key: `t('Save')` shows "Save" in English and looks it up in the
 * Bengali / Hindi dictionaries (src/i18n/locales). Anything not translated yet shows in English.
 *
 * The language is read once, before the app loads (see main.jsx), so `t()` works anywhere — in components, in
 * menus and lists built when a file loads, in toasts. Changing the language saves it and reloads the page.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English', short: 'EN', locale: 'en-IN' },
  { code: 'bn', name: 'বাংলা', short: 'বাং', locale: 'bn-IN' },
  { code: 'hi', name: 'हिन्दी', short: 'हि', locale: 'hi-IN' },
];

const STORAGE_KEY = 'jerp.lang';
// Column of each language in the dictionaries: { 'English': ['বাংলা', 'हिन्दी'] }.
const COLUMN = { bn: 0, hi: 1 };

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some((l) => l.code === v) ? v : null;
  } catch {
    return null;
  }
};

let current = readStored() ?? 'en';
let dictionary = {};

/** The language the app is shown in now: 'en', 'bn' or 'hi'. */
export const getLanguage = () => current;

/** For Intl (dates, month names) in the current language, with Western digits like the rest of the app. */
export const getLocale = () => `${LANGUAGES.find((l) => l.code === current)?.locale ?? 'en-IN'}-u-nu-latn`;

/** Loads the current language's words; main.jsx waits for this before loading the app. */
export async function loadLanguage() {
  document.documentElement.lang = current;
  if (current === 'en') return;
  // Letter spacing (used on small capital headings) pulls Bengali and Devanagari letters apart: keep it off.
  const style = document.createElement('style');
  style.textContent = '*, *::before, *::after { letter-spacing: normal !important; }';
  document.head.appendChild(style);
  // The letters for the language (Inter has Latin only).
  if (current === 'bn') import('@fontsource-variable/noto-sans-bengali');
  if (current === 'hi') import('@fontsource-variable/noto-sans-devanagari');
  const modules = import.meta.glob('./locales/*.js');
  const names = Object.keys(modules);
  const parts = await Promise.all(Object.values(modules).map((load) => load()));
  const col = COLUMN[current];
  const words = {};
  parts.forEach((part, i) => {
    const server = /\/server[\w-]*\.js$/.test(names[i]);
    for (const [en, tr] of Object.entries(part.default)) {
      if (!tr?.[col]) continue;
      words[en] = tr[col];
      if (server && en.includes('{{')) patterns.push(toPattern(en, tr[col]));
    }
  });
  // Most specific first: "Order {{no}} is {{status}} and can no longer be edited" before "Order {{no}} is {{status}}".
  patterns.sort((a, b) => b.literal - a.literal);
  dictionary = words;
}

// Messages the server builds from parts ("Ring (RG-01) is sold"): matched against `{{…}}` keys in locales/server.js.
const patterns = [];
function toPattern(en, translated) {
  const names = [];
  const source = en
    .split(/(\{\{\s*\w+\s*\}\})/)
    .map((piece) => {
      const m = piece.match(/^\{\{\s*(\w+)\s*\}\}$/);
      if (!m) return piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(m[1]);
      return '(.+?)';
    })
    .join('');
  return { re: new RegExp(`^${source}$`), names, translated, literal: en.replace(PLACEHOLDER, '').length };
}
/** A word or list from inside a server message: "customer orders, ledger entries and invoices", "3 invoices". */
function translatePart(value) {
  if (dictionary[value] != null) return dictionary[value];
  const one = (part) => {
    if (dictionary[part] != null) return dictionary[part];
    const counted = part.match(/^(\d+) (.+)$/);
    const key = counted && `{{count}} ${counted[2]}`;
    return key && dictionary[key] != null ? dictionary[key].replace(PLACEHOLDER, counted[1]) : null;
  };
  const parts = value.split(/, | and /);
  if (parts.length < 2) return one(value) ?? value;
  const done = parts.map(one);
  return done.every((p) => p != null) ? done.join(', ') : value;
}

function fromPattern(str) {
  for (const p of patterns) {
    const m = str.match(p.re);
    if (!m) continue;
    const vars = Object.fromEntries(p.names.map((n, i) => [n, translatePart(m[i + 1])]));
    return p.translated.replace(PLACEHOLDER, (x, k) => vars[k] ?? '');
  }
  return null;
}

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Translates English text. `{{name}}` in the text is filled from `vars`:
 * `t('Invoice {{no}} created', { no: sale.invoiceNo })`. When a value is a React element (a link, a bold amount),
 * the result is a list of pieces React can show.
 */
export function t(text, vars) {
  if (text == null || text === '') return text;
  const str = String(text);
  // Spaces around a piece of a sentence (' · paid') are kept as they are; only the words are looked up.
  const [, lead, core, trail] = str.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const translated = dictionary[str] ?? (dictionary[core] != null ? lead + dictionary[core] + trail : (patterns.length && !vars && fromPattern(str)) || str);
  if (!vars) return translated;
  const hasElement = Object.values(vars).some((v) => isValidElement(v));
  if (!hasElement) return translated.replace(PLACEHOLDER, (m, k) => (vars[k] ?? vars[k] === 0 ? String(vars[k]) : ''));
  const pieces = translated.split(PLACEHOLDER);
  // split() with a capture group: even indexes are text, odd ones the placeholder names.
  return pieces.map((p, i) => (i % 2 === 0 ? p : createElement(Fragment, { key: i }, vars[p] ?? null)));
}

// Set when the language is picked on a sign-in page: that fresh choice then goes to the account on sign-in.
const PICKED_SIGNED_OUT = 'jerp.langPickedSignedOut';

/**
 * A value that is usually data (a customer name, a report cell) but is sometimes a word the server fills in
 * ("Walk-in", "Cash"): translated only when the whole text is a known word.
 */
export const tValue = (value) => (typeof value === 'string' && current !== 'en' ? translatePart(value) : value);

/**
 * Saves the choice on this device and, when signed in, on the account (`saveToAccount`), then reloads to show the
 * app in it.
 */
export async function changeLanguage(code, saveToAccount) {
  if (!LANGUAGES.some((l) => l.code === code) || code === current) return;
  try {
    localStorage.setItem(STORAGE_KEY, code);
    if (!saveToAccount) sessionStorage.setItem(PICKED_SIGNED_OUT, '1');
  } catch {
    /* storage unavailable: the choice lasts until the page is closed */
  }
  try {
    await saveToAccount?.(code);
  } catch {
    /* saved on this device anyway */
  }
  window.location.reload();
}

/**
 * Once signed in: the account's saved language follows the user to this device — unless they just picked one on
 * the sign-in page, which then goes to the account instead (`saveToAccount`). Returns true when the page is
 * reloading into the account's language.
 */
export function syncAccountLanguage(accountLanguage, saveToAccount) {
  let pickedNow = false;
  try {
    pickedNow = sessionStorage.getItem(PICKED_SIGNED_OUT) === '1';
    sessionStorage.removeItem(PICKED_SIGNED_OUT);
  } catch {
    /* storage unavailable */
  }
  if (pickedNow || !accountLanguage) {
    if (accountLanguage !== current && (pickedNow || current !== 'en')) saveToAccount(current)?.catch?.(() => {});
    return false;
  }
  if (accountLanguage === current || !LANGUAGES.some((l) => l.code === accountLanguage)) return false;
  try {
    localStorage.setItem(STORAGE_KEY, accountLanguage);
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
