const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key) || key.startsWith('$') || key.includes('.')) continue;
      out[key] = clean(v);
    }
    return out;
  }
  return value;
}

export function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body);
  next();
}
