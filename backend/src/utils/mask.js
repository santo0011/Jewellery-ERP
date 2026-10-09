export function maskTail(value, visible = 4) {
  if (!value) return value ?? null;
  const s = String(value);
  return s.length <= visible ? s : `${'•'.repeat(s.length - visible)}${s.slice(-visible)}`;
}
